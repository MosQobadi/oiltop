import { prisma } from "@/lib/db";
import type { OrderStatus, PaymentStatus, Prisma } from "@/lib/generated/prisma/client";
import { contains, searchTokens } from "@/lib/search";
import { isPriceHoldActive } from "@/lib/storefront/cart";
import { DELIVERY_COST } from "@/lib/storefront/delivery";
import type {
  OrderListQuery,
  OrderNoteInput,
  OrderStatusUpdateInput,
  StorefrontOrderCreateInput,
  StorefrontOrderListQuery,
} from "@/lib/validation";

// Storefront Design Decision 6 — RESOLVED (2026-08-09, Storefront Task 0.5)
// and IMPLEMENTED (2026-08-10, Storefront Task 8.1): guest checkout stores a
// guest order, not a silently-created account. `Order.customerId` is nullable
// and `Order` carries guestName/guestPhone/guestEmail, so a guest order holds
// its contact details on the row itself.
// Rejected alternative: creating a CUSTOMER `User` per guest order — it would
// need a junk `passwordHash` that can never log in, litter the admin Customers
// list with unreachable rows, and collide on the phone-unique constraint that
// Design Decision 7 / Task 0.6 adds the moment a guest orders twice.
export class OrderNotFoundError extends Error {}
export class InvalidOrderTransitionError extends Error {}

// Someone else's order, or a guest order nobody owns. Separate from
// `OrderNotFoundError` because the storefront route answers 403 rather than 404
// — the id in the URL is real, it simply isn't theirs to read.
export class OrderAccessDeniedError extends Error {}

// PENDING -> SENDING -> SENT -> DELIVERED is the only forward path; CANCELLED
// is reachable only from PENDING or SENDING. Every other pair (skipping a
// step, moving backward, or acting on a terminal status) is rejected.
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["SENDING", "CANCELLED"],
  SENDING: ["SENT", "CANCELLED"],
  SENT: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

// A guest order has no customer row to read a name off, so it falls back to the
// name the checkout form collected. The final "Guest" fallback covers a guest
// order saved without one — nothing enforces guestName at the database level.
function orderContactName(order: {
  customer: { firstName: string; lastName: string } | null;
  guestName: string | null;
}) {
  return order.customer
    ? `${order.customer.firstName} ${order.customer.lastName}`
    : (order.guestName ?? "Guest");
}

export function toOrderListItem(
  order: Prisma.OrderGetPayload<{
    include: {
      customer: { select: { firstName: true; lastName: true } };
      _count: { select: { items: true } };
    };
  }>,
) {
  return {
    id: order.id,
    customerName: orderContactName(order),
    isGuest: order.customerId === null,
    itemCount: order._count.items,
    total: Number(order.total),
    status: order.status,
    paymentStatus: order.paymentStatus,
    date: order.createdAt,
  };
}

export async function listOrders(query: OrderListQuery) {
  const where: Prisma.OrderWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.payment ? { paymentStatus: query.payment } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          createdAt: {
            ...(query.dateFrom ? { gte: query.dateFrom } : {}),
            ...(query.dateTo ? { lte: query.dateTo } : {}),
          },
        }
      : {}),
    // Guest fields are searched alongside the customer relation, otherwise a
    // guest order would be unreachable from the Customer search box. Tokenised
    // so "Sara Ahmadi" spans firstName + lastName — see `lib/search.ts`.
    AND: searchTokens(query.search).map((token) => ({
      OR: [
        { customer: { firstName: contains(token) } },
        { customer: { lastName: contains(token) } },
        { customer: { email: contains(token) } },
        { guestName: contains(token) },
        { guestEmail: contains(token) },
        { guestPhone: contains(token) },
      ],
    })),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return { items: orders.map(toOrderListItem), total };
}

export async function getOrderById(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      },
      items: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!order) {
    throw new OrderNotFoundError(`Order "${id}" was not found`);
  }

  return {
    id: order.id,
    // Normalized so the detail screen renders one contact block either way:
    // `id` is null and `isGuest` true when nobody was signed in at checkout.
    customer: {
      id: order.customer?.id ?? null,
      name: orderContactName(order),
      email: order.customer ? order.customer.email : order.guestEmail,
      phone: order.customer ? order.customer.phone : order.guestPhone,
      isGuest: order.customerId === null,
    },
    shippingAddress: order.shippingAddress,
    postalCode: order.postalCode,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    shippingCost: Number(order.shippingCost),
    tax: Number(order.tax),
    total: Number(order.total),
    status: order.status,
    paymentStatus: order.paymentStatus,
    adminNote: order.adminNote,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productNameSnapshot,
      price: Number(item.priceSnapshot),
      quantity: item.quantity,
      lineTotal: Number(item.lineTotal),
    })),
  };
}

export async function updateOrderStatus(id: string, input: OrderStatusUpdateInput) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    throw new OrderNotFoundError(`Order "${id}" was not found`);
  }

  if (!VALID_TRANSITIONS[order.status].includes(input.status)) {
    throw new InvalidOrderTransitionError(
      `Cannot transition order from ${order.status} to ${input.status}`,
    );
  }

  return prisma.order.update({ where: { id }, data: { status: input.status } });
}

export async function updateOrderNote(id: string, input: OrderNoteInput) {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) {
    throw new OrderNotFoundError(`Order "${id}" was not found`);
  }

  return prisma.order.update({ where: { id }, data: { adminNote: input.adminNote } });
}

// ---------------------------------------------------------------------------
// Storefront checkout
// ---------------------------------------------------------------------------

/** Why a cart line can't be ordered. One per offending line. */
export type CheckoutLineProblem =
  | { productId: string; reason: "unavailable" }
  | { productId: string; reason: "insufficient_stock"; available: number };

// Not a validation failure — the payload was well-formed, the catalog simply
// moved underneath it while the cart sat in the browser. The route answers 409
// so the client knows to re-read the cart rather than re-edit the form.
export class CheckoutRejectedError extends Error {
  constructor(
    message: string,
    readonly problems: CheckoutLineProblem[],
  ) {
    super(message);
  }
}

const checkoutProductSelect = {
  id: true,
  nameEn: true,
  price: true,
  discountPercent: true,
  inventory: { select: { stock: true } },
} satisfies Prisma.ProductSelect;

// A price as the customer would be charged it. Both halves are kept, not just
// the final figure: the order's `subtotal`/`discount` split needs the list
// price the discount came off, and it has to be the *same* quote the line was
// charged at or the two columns won't reconcile.
interface PriceQuote {
  price: number;
  discountPercent: number;
  finalPrice: number;
}

// Rounded to whole Toman here, unlike the catalog's read-time `finalPrice`
// which leaves the float alone for display — this is the number that gets
// multiplied by a quantity and written to the order.
function quote(price: number, discountPercent: number): PriceQuote {
  return {
    price,
    discountPercent,
    finalPrice: Math.round(price * (1 - discountPercent / 100)),
  };
}

// What the product cost at `addedAt`, per Design Decision 8: the most recent
// ProductPriceLog row that was already in effect then. A row records the price
// a change moved *to*, so the latest one at or before `addedAt` is the price
// that was live at that moment.
//
// No such row means the cart predates the product's first recorded change — the
// price before that change was never written down, so there is nothing to
// honour and the current price stands.
async function priceInEffectAt(
  productId: string,
  addedAt: Date,
  current: PriceQuote,
): Promise<PriceQuote> {
  const logged = await prisma.productPriceLog.findFirst({
    where: { productId, changedAt: { lte: addedAt } },
    orderBy: { changedAt: "desc" },
    select: { price: true, discountPercent: true },
  });
  return logged ? quote(Number(logged.price), logged.discountPercent) : current;
}

function describeProblems(problems: CheckoutLineProblem[]): string {
  return problems.some((problem) => problem.reason === "unavailable")
    ? "Some items in your cart are no longer available. Please review your cart."
    : "Some items in your cart are no longer in stock in the quantity you asked for. Please review your cart.";
}

/**
 * Places a storefront order.
 *
 * Nothing about money comes from the client: quantities and the delivery method
 * are inputs, every price is looked up here, and the totals are recomputed from
 * those prices. `customerId` comes from the auth cookie the route verified — a
 * null one means a guest order, and the contact block is stored on the row
 * itself (Design Decision 6).
 */
export async function createStorefrontOrder(
  input: StorefrontOrderCreateInput,
  customerId: string | null,
) {
  const now = new Date();

  // Same visibility rules as the cart lookup: a product under a deactivated
  // category or brand is not purchasable even though its own row is ACTIVE.
  const products = await prisma.product.findMany({
    where: {
      id: { in: input.items.map((item) => item.productId) },
      status: "ACTIVE",
      category: { is: { status: "ACTIVE" } },
      brand: { is: { status: "ACTIVE" } },
    },
    select: checkoutProductSelect,
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  // Every offending line is collected before throwing — a customer fixing one
  // item at a time to be told about the next one is three round trips.
  const problems: CheckoutLineProblem[] = [];
  for (const item of input.items) {
    const product = byId.get(item.productId);
    if (!product) {
      problems.push({ productId: item.productId, reason: "unavailable" });
      continue;
    }
    const stock = product.inventory?.stock ?? 0;
    if (item.quantity > stock) {
      problems.push({ productId: item.productId, reason: "insufficient_stock", available: stock });
    }
  }
  if (problems.length > 0) {
    throw new CheckoutRejectedError(describeProblems(problems), problems);
  }

  const lines = await Promise.all(
    input.items.map(async (item) => {
      const product = byId.get(item.productId)!;
      const current = quote(Number(product.price), product.discountPercent);
      const atAdd = await priceInEffectAt(item.productId, item.addedAt, current);

      // The hold protects the customer from an increase; it is not a licence to
      // charge them more than the shelf price. Within the window the cheaper of
      // the two wins, which is also the only answer consistent with the cart
      // screen — that shows the live price, so honouring a higher held one
      // would charge more than the number the customer was looking at.
      const charged =
        isPriceHoldActive(item.addedAt, now) && atAdd.finalPrice <= current.finalPrice
          ? atAdd
          : current;

      return {
        productId: product.id,
        productNameSnapshot: product.nameEn,
        quantity: item.quantity,
        unitPrice: charged.finalPrice,
        listTotal: charged.price * item.quantity,
        lineTotal: charged.finalPrice * item.quantity,
        // What the cart quoted vs. what checkout charged. True whenever the
        // hold expired onto a different price, and also on the rarer case above
        // where the product got cheaper than the held price.
        repriced: charged.finalPrice !== atAdd.finalPrice,
        previousUnitPrice: charged.finalPrice !== atAdd.finalPrice ? atAdd.finalPrice : null,
      };
    }),
  );

  // `subtotal` is the list price before product discounts and `discount` is
  // what those discounts took off, so `subtotal - discount` is the sum of the
  // line totals and the admin's Totals card still adds up top to bottom.
  const subtotal = lines.reduce((sum, line) => sum + line.listTotal, 0);
  const discount = subtotal - lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const shippingCost = DELIVERY_COST[input.deliveryMethod];
  // VAT (9%) is *included* in every price shown and charged, not added on top
  // (design brief), so there is nothing to add to the total here. Storing the
  // included portion would make the admin's Totals card — which reads as
  // subtotal − discount + shipping + tax = total — stop reconciling.
  const tax = 0;
  const total = subtotal - discount + shippingCost + tax;

  const order = await prisma.$transaction(async (tx) => {
    for (const line of lines) {
      // The stock check above can go stale between then and here, so the
      // decrement carries the check with it: `stock >= quantity` in the WHERE
      // means two simultaneous checkouts can't both take the last unit. A miss
      // throws, which rolls the whole transaction back.
      const { count } = await tx.inventory.updateMany({
        where: { productId: line.productId, stock: { gte: line.quantity } },
        data: { stock: { decrement: line.quantity }, lastUpdatedAt: now },
      });
      if (count !== 1) {
        const inventory = await tx.inventory.findUnique({
          where: { productId: line.productId },
          select: { stock: true },
        });
        const problem: CheckoutLineProblem = {
          productId: line.productId,
          reason: "insufficient_stock",
          available: inventory?.stock ?? 0,
        };
        throw new CheckoutRejectedError(describeProblems([problem]), [problem]);
      }
    }

    return tx.order.create({
      data: {
        customerId,
        guestName: customerId ? null : input.contactName,
        guestPhone: customerId ? null : input.contactPhone,
        guestEmail: customerId ? null : (input.contactEmail ?? null),
        status: "PENDING",
        paymentStatus: "UNPAID",
        subtotal,
        discount,
        shippingCost,
        tax,
        total,
        shippingAddress: input.shippingAddress,
        postalCode: input.postalCode,
        items: {
          create: lines.map((line) => ({
            productId: line.productId,
            productNameSnapshot: line.productNameSnapshot,
            priceSnapshot: line.unitPrice,
            quantity: line.quantity,
            lineTotal: line.lineTotal,
          })),
        },
      },
      select: { id: true, createdAt: true },
    });
  });

  // The confirmation screen renders this and nothing else — it is the snapshot,
  // so re-reading the product afterwards can't make a placed order change.
  // `deliveryMethod` isn't echoed because it isn't stored: the schema keeps the
  // cost it produced, not which of the two buttons was pressed.
  return {
    id: order.id,
    createdAt: order.createdAt,
    status: "PENDING" as const,
    paymentStatus: "UNPAID" as const,
    subtotal,
    discount,
    shippingCost,
    tax,
    total,
    shippingAddress: input.shippingAddress,
    postalCode: input.postalCode,
    items: lines.map((line) => ({
      productId: line.productId,
      productName: line.productNameSnapshot,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      repriced: line.repriced,
      previousUnitPrice: line.previousUnitPrice,
    })),
  };
}

// ---------------------------------------------------------------------------
// Storefront order history
// ---------------------------------------------------------------------------

// A customer's own view of an order, which is deliberately narrower than
// `getOrderById`'s. `adminNote` is absent — it is staff-to-staff text about the
// customer, and the read that serves the account screens must not be one edit
// away from publishing it. The guest contact columns are absent too: an order
// only reaches these functions when it has an owner, so there is nothing there
// to show.
export interface CustomerOrderListItem {
  id: string;
  createdAt: Date;
  itemCount: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
}

export interface CustomerOrderItem {
  id: string;
  productId: string;
  /** `productNameSnapshot` — the name as it stood when the order was placed. */
  productName: string;
  price: number;
  quantity: number;
  lineTotal: number;
}

export interface CustomerOrder extends CustomerOrderListItem {
  subtotal: number;
  discount: number;
  shippingCost: number;
  tax: number;
  shippingAddress: string;
  postalCode: string;
  items: CustomerOrderItem[];
}

/**
 * One customer's order history, newest first.
 *
 * `customerId` is the verified session's, never a query param — and it is a
 * required `string` rather than the column's nullable type on purpose: passing
 * the null a guest order carries would make `where` match every guest order in
 * the table instead of none.
 */
export async function listCustomerOrders(
  customerId: string,
  query: StorefrontOrderListQuery,
): Promise<{ items: CustomerOrderListItem[]; total: number }> {
  const where: Prisma.OrderWhereInput = { customerId };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    items: orders.map((order) => ({
      id: order.id,
      createdAt: order.createdAt,
      itemCount: order._count.items,
      total: Number(order.total),
      status: order.status,
      paymentStatus: order.paymentStatus,
    })),
    total,
  };
}

/**
 * One order, as its owner sees it.
 *
 * The order is looked up by id and *then* checked against `customerId`, rather
 * than filtered by both, so "no such order" and "not yours" stay two different
 * answers — the route turns them into 404 and 403. A guest order fails the same
 * check as another customer's: `customerId` is null on it, and nobody owns it.
 */
export async function getCustomerOrderById(id: string, customerId: string): Promise<CustomerOrder> {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  if (!order) {
    throw new OrderNotFoundError(`Order "${id}" was not found`);
  }
  if (order.customerId !== customerId) {
    throw new OrderAccessDeniedError("This order belongs to a different account");
  }

  return {
    id: order.id,
    createdAt: order.createdAt,
    itemCount: order.items.length,
    status: order.status,
    paymentStatus: order.paymentStatus,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    shippingCost: Number(order.shippingCost),
    tax: Number(order.tax),
    total: Number(order.total),
    shippingAddress: order.shippingAddress,
    postalCode: order.postalCode,
    // Snapshot columns, not a join back to Product: what the order says it was
    // must not change when the catalog does.
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productNameSnapshot,
      price: Number(item.priceSnapshot),
      quantity: item.quantity,
      lineTotal: Number(item.lineTotal),
    })),
  };
}
