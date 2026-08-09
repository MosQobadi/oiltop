import { beforeEach, describe, expect, it } from "vitest";
import { selectCartItemCount, useCartStore, type NewCartItem } from "./cart";

const oil: NewCartItem = {
  productId: "prod_1",
  slug: "mobil-1-esp-5w30",
  nameEn: "Mobil 1 ESP 5W-30",
  nameFa: "موبیل ۱ ای‌اس‌پی",
  image: null,
  price: 4_850_000,
};

const filter: NewCartItem = {
  productId: "prod_2",
  slug: "mann-oil-filter",
  nameEn: "Mann Oil Filter",
  nameFa: null,
  image: null,
  price: 620_000,
};

beforeEach(() => {
  useCartStore.setState({ items: [] });
});

describe("useCartStore", () => {
  it("adds a new line with the requested quantity", () => {
    useCartStore.getState().addItem(oil, 2);

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0]).toMatchObject({ productId: "prod_1", quantity: 2 });
  });

  it("bumps the quantity of an existing line and keeps its original addedAt", () => {
    useCartStore.getState().addItem(oil);
    const { addedAt } = useCartStore.getState().items[0]!;

    useCartStore.getState().addItem(oil, 3);

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0]).toMatchObject({ quantity: 4, addedAt });
  });

  it("drops a line when its quantity is set to zero or below", () => {
    useCartStore.getState().addItem(oil);
    useCartStore.getState().addItem(filter);

    useCartStore.getState().updateQuantity("prod_1", 0);

    expect(useCartStore.getState().items.map((line) => line.productId)).toEqual(["prod_2"]);
  });

  it("removes and clears", () => {
    useCartStore.getState().addItem(oil);
    useCartStore.getState().addItem(filter);

    useCartStore.getState().removeItem("prod_2");
    expect(useCartStore.getState().items).toHaveLength(1);

    useCartStore.getState().clear();
    expect(useCartStore.getState().items).toHaveLength(0);
  });
});

describe("selectCartItemCount", () => {
  it("sums quantities rather than counting lines", () => {
    useCartStore.getState().addItem(oil, 2);
    useCartStore.getState().addItem(filter, 3);

    expect(selectCartItemCount(useCartStore.getState())).toBe(5);
  });

  it("is 0 for an empty cart", () => {
    expect(selectCartItemCount(useCartStore.getState())).toBe(0);
  });
});
