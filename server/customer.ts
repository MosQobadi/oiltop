import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { CustomerListQuery, CustomerStatusInput } from "@/lib/validation";
import { toOrderListItem } from "@/server/order";

export class CustomerNotFoundError extends Error {}

function toCustomerListItem(
  user: Prisma.UserGetPayload<{ include: { _count: { select: { orders: true } } } }>,
) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    status: user.status,
    orderCount: user._count.orders,
    createdAt: user.createdAt,
  };
}

export async function listCustomers(query: CustomerListQuery) {
  const where: Prisma.UserWhereInput = {
    role: "CUSTOMER",
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: "insensitive" } },
            { lastName: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
            { phone: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { _count: { select: { orders: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items: users.map(toCustomerListItem), total };
}

export async function getCustomerById(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== "CUSTOMER") {
    throw new CustomerNotFoundError(`Customer "${id}" was not found`);
  }

  const orders = await prisma.order.findMany({
    where: { customerId: id },
    include: {
      customer: { select: { firstName: true, lastName: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    status: user.status,
    createdAt: user.createdAt,
    orders: orders.map(toOrderListItem),
  };
}

export async function updateCustomerStatus(id: string, input: CustomerStatusInput) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== "CUSTOMER") {
    throw new CustomerNotFoundError(`Customer "${id}" was not found`);
  }

  return prisma.user.update({ where: { id }, data: { status: input.status } });
}
