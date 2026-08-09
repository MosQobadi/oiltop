import { prisma } from "@/lib/db";
import type { OrderStatus, Prisma } from "@/lib/generated/prisma/client";
import type {
  OrderListQuery,
  OrderNoteInput,
  OrderStatusUpdateInput,
} from "@/lib/validation";

// Storefront Design Decision 6 — RESOLVED (2026-08-09, Storefront Task 0.5):
// guest checkout stores a guest order, not a silently-created account.
// `Order.customerId` becomes nullable and `Order` gains guestName/guestPhone/
// guestEmail; a guest order carries contact details on the row itself.
// Rejected alternative: creating a CUSTOMER `User` per guest order — it would
// need a junk `passwordHash` that can never log in, litter the admin Customers
// list with unreachable rows, and collide on the phone-unique constraint that
// Design Decision 7 / Task 0.6 adds the moment a guest orders twice.
// Not yet migrated: the schema change and the null-customer handling below
// (see `toOrderListItem`, which today assumes `order.customer` is present)
// belong to Phase 10, which owns storefront checkout.
export class OrderNotFoundError extends Error {}
export class InvalidOrderTransitionError extends Error {}

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
    customerName: `${order.customer.firstName} ${order.customer.lastName}`,
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
    ...(query.search
      ? {
          customer: {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          },
        }
      : {}),
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
    customer: order.customer,
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
