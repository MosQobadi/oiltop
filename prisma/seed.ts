import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import {
  PrismaClient,
  PartType,
  FilterKind,
  FuelType,
  FitmentClimate,
  FitmentInquiryStatus,
  OrderStatus,
  PaymentStatus,
  UserRole,
  UserStatus,
} from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Flat rate used for every seeded order — no tax/coupon logic exists yet, so
// order totals are kept to subtotal + shipping for a deterministic seed.
const SHIPPING_COST = 200_000;

function finalPrice(price: number, discountPercent: number) {
  return Math.round(price * (1 - discountPercent / 100));
}

async function main() {
  // Reset in FK-safe (children-first) order so the script can be re-run.
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.fitmentInquiry.deleteMany();
  await prisma.carEngineFitmentProfile.deleteMany();
  await prisma.fitmentProfileItem.deleteMany();
  await prisma.fitmentProfile.deleteMany();
  await prisma.fitmentRecommendation.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.carEngine.deleteMany();
  await prisma.carModel.deleteMany();
  await prisma.carBrand.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  // ---------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------

  const adminPasswordHash = await bcrypt.hash("Admin123!", 10);
  await prisma.user.create({
    data: {
      email: "admin@topoil.com",
      phone: "+989120000000",
      passwordHash: adminPasswordHash,
      firstName: "Admin",
      lastName: "User",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  const mosPasswordHash = await bcrypt.hash("mostafa123", 10);
  await prisma.user.create({
    data: {
      email: "mos.qobad@gmail.com",
      passwordHash: mosPasswordHash,
      firstName: "Mos",
      lastName: "Qobadi",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  const customerPasswordHash = await bcrypt.hash("Customer123!", 10);
  const customerSeeds = [
    { email: "sara.ahmadi@example.com", phone: "+989351112233", firstName: "Sara", lastName: "Ahmadi" },
    { email: "amir.rezaei@example.com", phone: "+989121234567", firstName: "Amir", lastName: "Rezaei" },
    { email: "niloofar.karimi@example.com", phone: "+989173334455", firstName: "Niloofar", lastName: "Karimi" },
    { email: "reza.hosseini@example.com", phone: "+989196667788", firstName: "Reza", lastName: "Hosseini" },
    { email: "maryam.jafari@example.com", phone: "+989301239876", firstName: "Maryam", lastName: "Jafari" },
  ];
  const customers = [];
  for (const seed of customerSeeds) {
    customers.push(
      await prisma.user.create({
        data: {
          ...seed,
          passwordHash: customerPasswordHash,
          role: UserRole.CUSTOMER,
          status: UserStatus.ACTIVE,
        },
      }),
    );
  }

  // ---------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------

  const engineOil = await prisma.category.create({
    data: {
      slug: "engine-oil",
      nameEn: "Engine Oil",
      nameFa: "روغن موتور",
      tags: ["engine oil", "lubricant", "synthetic"],
      shortDescriptionEn: "High-performance engine oils for passenger cars.",
      shortDescriptionFa: "روغن‌های موتور با کیفیت بالا برای خودروهای سواری.",
      longDescriptionEn:
        "A curated range of mineral, semi-synthetic, and fully synthetic engine oils suited to different climates and driving conditions.",
      longDescriptionFa:
        "مجموعه‌ای منتخب از روغن‌های معدنی، نیمه‌سنتتیک و تمام‌سنتتیک متناسب با آب‌وهوا و شرایط رانندگی مختلف.",
      partType: PartType.ENGINE_OIL,
      status: "ACTIVE",
    },
  });

  const oilFilter = await prisma.category.create({
    data: {
      slug: "oil-filter",
      nameEn: "Oil Filter",
      nameFa: "فیلتر روغن",
      tags: ["oil filter", "filtration"],
      shortDescriptionEn: "Genuine and OE-equivalent oil filters.",
      shortDescriptionFa: "فیلترهای روغن اصلی و معادل با قطعات اورجینال.",
      longDescriptionEn:
        "Oil filters engineered to trap contaminants and protect engine internals across service intervals.",
      longDescriptionFa:
        "فیلترهای روغن طراحی‌شده برای حذف آلودگی‌ها و محافظت از اجزای داخلی موتور در طول دوره‌های سرویس.",
      partType: PartType.FILTER,
      filterKind: FilterKind.OIL_FILTER,
      status: "ACTIVE",
    },
  });

  const airFilter = await prisma.category.create({
    data: {
      slug: "air-filter",
      nameEn: "Air Filter",
      nameFa: "فیلتر هوا",
      tags: ["air filter", "intake"],
      shortDescriptionEn: "Air filters that keep dust and debris out of the intake.",
      shortDescriptionFa: "فیلترهای هوا که گردوغبار را از مسیر ورودی هوا دور نگه می‌دارند.",
      longDescriptionEn:
        "Engineered filter media that balances airflow and filtration efficiency for reliable engine breathing.",
      longDescriptionFa:
        "رسانه فیلتراسیون مهندسی‌شده که جریان هوا و کارایی فیلتراسیون را برای تنفس مطمئن موتور متعادل می‌کند.",
      partType: PartType.FILTER,
      filterKind: FilterKind.AIR_FILTER,
      status: "ACTIVE",
    },
  });

  const cabinFilter = await prisma.category.create({
    data: {
      slug: "cabin-filter",
      nameEn: "Cabin Filter",
      nameFa: "فیلتر کابین",
      tags: ["cabin filter", "cabin air"],
      shortDescriptionEn: "Cabin air filters for cleaner in-car air.",
      shortDescriptionFa: "فیلترهای هوای کابین برای هوای تمیزتر داخل خودرو.",
      longDescriptionEn:
        "Filters dust, pollen, and particulates from the air entering the cabin's ventilation system.",
      longDescriptionFa:
        "گردوغبار، گرده گیاهان و ذرات معلق را از هوای ورودی به سیستم تهویه کابین حذف می‌کند.",
      partType: PartType.FILTER,
      filterKind: FilterKind.CABIN_FILTER,
      status: "ACTIVE",
    },
  });

  const fuelFilter = await prisma.category.create({
    data: {
      slug: "fuel-filter",
      nameEn: "Fuel Filter",
      nameFa: "فیلتر سوخت",
      tags: ["fuel filter", "fuel system"],
      shortDescriptionEn: "Fuel filters that protect injectors from contamination.",
      shortDescriptionFa: "فیلترهای سوخت که انژکتورها را از آلودگی محافظت می‌کنند.",
      longDescriptionEn: "Removes particulates and moisture from fuel before it reaches the injection system.",
      longDescriptionFa: "ذرات معلق و رطوبت را پیش از رسیدن سوخت به سیستم انژکتور حذف می‌کند.",
      partType: PartType.FILTER,
      filterKind: FilterKind.FUEL_FILTER,
      status: "ACTIVE",
    },
  });

  // ---------------------------------------------------------------------
  // Brands
  // ---------------------------------------------------------------------

  const mobil1 = await prisma.brand.create({
    data: { slug: "mobil-1", nameEn: "Mobil 1", nameFa: "موبیل ۱", status: "ACTIVE" },
  });
  const castrol = await prisma.brand.create({
    data: { slug: "castrol", nameEn: "Castrol", nameFa: "کاسترول", status: "ACTIVE" },
  });
  const bosch = await prisma.brand.create({
    data: { slug: "bosch", nameEn: "Bosch", nameFa: "بوش", status: "ACTIVE" },
  });
  const mannFilter = await prisma.brand.create({
    data: { slug: "mann-filter", nameEn: "Mann-Filter", nameFa: "مان فیلتر", status: "ACTIVE" },
  });

  // ---------------------------------------------------------------------
  // Products + Inventory
  // ---------------------------------------------------------------------

  type ProductSeed = {
    sku: string;
    nameEn: string;
    nameFa: string;
    categoryId: string;
    brandId: string;
    price: number;
    discountPercent: number;
    tags: string[];
    oemPartNumbers?: string[];
    shortDescriptionEn: string;
    shortDescriptionFa: string;
    longDescriptionEn: string;
    longDescriptionFa: string;
    stock: number;
  };

  const productSeeds: Record<string, ProductSeed> = {
    mobilOil5w30: {
      sku: "OIL-MOB-5W30",
      nameEn: "Mobil 1 5W-30 Advanced Fully Synthetic",
      nameFa: "موبیل ۱ 5W-30 تمام‌سنتتیک",
      categoryId: engineOil.id,
      brandId: mobil1.id,
      price: 1_250_000,
      discountPercent: 10,
      tags: ["5W-30", "fully synthetic", "API SN"],
      shortDescriptionEn: "All-round fully synthetic oil for everyday driving.",
      shortDescriptionFa: "روغن تمام‌سنتتیک همه‌کاره برای رانندگی روزمره.",
      longDescriptionEn: "Advanced full synthetic formula that keeps engines running clean across long service intervals.",
      longDescriptionFa: "فرمول پیشرفته تمام‌سنتتیک که موتور را در طول دوره‌های سرویس طولانی تمیز نگه می‌دارد.",
      stock: 40,
    },
    mobilOil0w40: {
      sku: "OIL-MOB-0W40",
      nameEn: "Mobil 1 0W-40 Fully Synthetic",
      nameFa: "موبیل ۱ 0W-40 تمام‌سنتتیک",
      categoryId: engineOil.id,
      brandId: mobil1.id,
      price: 1_450_000,
      discountPercent: 5,
      tags: ["0W-40", "fully synthetic", "hot climate"],
      shortDescriptionEn: "Low-viscosity synthetic oil suited to sustained high temperatures.",
      shortDescriptionFa: "روغن سنتتیک کم‌ویسکوزیته مناسب دماهای بالا و پایدار.",
      longDescriptionEn: "Maintains protection and oil pressure under sustained high ambient and engine temperatures.",
      longDescriptionFa: "محافظت و فشار روغن را در دماهای محیط و موتور بالا و پایدار حفظ می‌کند.",
      stock: 25,
    },
    castrolOil5w40: {
      sku: "OIL-CAS-5W40",
      nameEn: "Castrol Magnatec 5W-40",
      nameFa: "کاسترول مگناتک 5W-40",
      categoryId: engineOil.id,
      brandId: castrol.id,
      price: 1_100_000,
      discountPercent: 0,
      tags: ["5W-40", "semi-synthetic"],
      shortDescriptionEn: "Intelligent molecules cling to critical engine parts for extra protection.",
      shortDescriptionFa: "مولکول‌های هوشمند به قطعات حیاتی موتور می‌چسبند و محافظت اضافه ایجاد می‌کنند.",
      longDescriptionEn: "Reduces wear from cold starts by forming a protective layer that clings to engine parts even when the engine is off.",
      longDescriptionFa: "با تشکیل لایه محافظ که حتی هنگام خاموش بودن موتور به قطعات می‌چسبد، سایش ناشی از استارت سرد را کاهش می‌دهد.",
      stock: 30,
    },
    castrolOil0w20: {
      sku: "OIL-CAS-0W20",
      nameEn: "Castrol Edge 0W-20",
      nameFa: "کاسترول اج 0W-20",
      categoryId: engineOil.id,
      brandId: castrol.id,
      price: 1_350_000,
      discountPercent: 15,
      tags: ["0W-20", "fully synthetic", "cold climate"],
      shortDescriptionEn: "Fully synthetic oil formulated for smooth cold-weather starts.",
      shortDescriptionFa: "روغن تمام‌سنتتیک فرموله‌شده برای استارت روان در هوای سرد.",
      longDescriptionEn: "Titanium-strengthened formula that flows quickly at low temperatures to protect the engine from the first turn of the key.",
      longDescriptionFa: "فرمول تقویت‌شده با تیتانیوم که در دماهای پایین به سرعت جریان می‌یابد و از همان اولین چرخش سوئیچ از موتور محافظت می‌کند.",
      stock: 18,
    },
    boschOilFilter: {
      sku: "FLT-BOS-OIL-P3000",
      nameEn: "Bosch P3000 Oil Filter",
      nameFa: "فیلتر روغن بوش P3000",
      categoryId: oilFilter.id,
      brandId: bosch.id,
      price: 320_000,
      discountPercent: 0,
      tags: ["oil filter", "spin-on"],
      oemPartNumbers: ["04152-YZZA1", "90915-YZZD4"],
      shortDescriptionEn: "Spin-on oil filter with high dirt-holding capacity.",
      shortDescriptionFa: "فیلتر روغن پیچی با ظرفیت بالای نگهداری آلودگی.",
      longDescriptionEn: "Multi-layer filter media traps fine particles while maintaining steady oil flow across the service interval.",
      longDescriptionFa: "رسانه فیلتراسیون چندلایه ذرات ریز را به دام می‌اندازد و جریان روغن را در طول دوره سرویس پایدار نگه می‌دارد.",
      stock: 60,
    },
    mannOilFilter: {
      sku: "FLT-MAN-OIL-W712",
      nameEn: "Mann-Filter W712/75 Oil Filter",
      nameFa: "فیلتر روغن مان فیلتر W712/75",
      categoryId: oilFilter.id,
      brandId: mannFilter.id,
      price: 290_000,
      discountPercent: 5,
      tags: ["oil filter", "spin-on"],
      shortDescriptionEn: "OE-equivalent spin-on oil filter for reliable filtration.",
      shortDescriptionFa: "فیلتر روغن پیچی معادل اورجینال برای فیلتراسیون قابل‌اعتماد.",
      longDescriptionEn: "Built to OE specification with an anti-drain-back valve to protect against dry starts.",
      longDescriptionFa: "مطابق با مشخصات اورجینال ساخته شده و دارای سوپاپ ضد تخلیه برای محافظت در برابر استارت خشک.",
      stock: 45,
    },
    boschAirFilter: {
      sku: "FLT-BOS-AIR-S3413",
      nameEn: "Bosch S3413 Air Filter",
      nameFa: "فیلتر هوا بوش S3413",
      categoryId: airFilter.id,
      brandId: bosch.id,
      price: 380_000,
      discountPercent: 0,
      tags: ["air filter", "intake"],
      shortDescriptionEn: "Panel air filter with pleated paper media.",
      shortDescriptionFa: "فیلتر هوای پنلی با رسانه کاغذی چین‌دار.",
      longDescriptionEn: "Pleated paper media provides high filtration efficiency while keeping airflow restriction low.",
      longDescriptionFa: "رسانه کاغذی چین‌دار کارایی فیلتراسیون بالایی ارائه می‌دهد و در عین حال افت جریان هوا را کم نگه می‌دارد.",
      stock: 8,
    },
    mannAirFilter: {
      sku: "FLT-MAN-AIR-C25114",
      nameEn: "Mann-Filter C25114 Air Filter",
      nameFa: "فیلتر هوا مان فیلتر C25114",
      categoryId: airFilter.id,
      brandId: mannFilter.id,
      price: 350_000,
      discountPercent: 0,
      tags: ["air filter", "intake"],
      oemPartNumbers: ["17801-0Y060"],
      shortDescriptionEn: "OE-equivalent panel air filter.",
      shortDescriptionFa: "فیلتر هوای پنلی معادل اورجینال.",
      longDescriptionEn: "Matches OE dimensions and filtration rating for a direct replacement fit.",
      longDescriptionFa: "از نظر ابعاد و رتبه فیلتراسیون مطابق با قطعه اورجینال است و جایگزینی مستقیم را فراهم می‌کند.",
      stock: 22,
    },
    boschCabinFilter: {
      sku: "FLT-BOS-CAB-AC",
      nameEn: "Bosch Cabin Air Filter",
      nameFa: "فیلتر کابین بوش",
      categoryId: cabinFilter.id,
      brandId: bosch.id,
      price: 260_000,
      discountPercent: 0,
      tags: ["cabin filter", "cabin air"],
      shortDescriptionEn: "Cabin filter that traps dust and pollen before it reaches the cabin.",
      shortDescriptionFa: "فیلتر کابین که گردوغبار و گرده گیاهان را پیش از ورود به کابین به دام می‌اندازد.",
      longDescriptionEn: "Multi-layer media captures fine dust and pollen for cleaner cabin air.",
      longDescriptionFa: "رسانه چندلایه گردوغبار ریز و گرده گیاهان را جذب می‌کند تا هوای کابین تمیزتر باشد.",
      stock: 15,
    },
    mannFuelFilter: {
      sku: "FLT-MAN-FUEL-WK820",
      nameEn: "Mann-Filter WK820 Fuel Filter",
      nameFa: "فیلتر سوخت مان فیلتر WK820",
      categoryId: fuelFilter.id,
      brandId: mannFilter.id,
      price: 340_000,
      discountPercent: 0,
      tags: ["fuel filter"],
      shortDescriptionEn: "In-line fuel filter that protects injectors from contamination.",
      shortDescriptionFa: "فیلتر سوخت خطی که انژکتورها را از آلودگی محافظت می‌کند.",
      longDescriptionEn: "Removes particulates and water from fuel before it reaches the injection system.",
      longDescriptionFa: "ذرات معلق و آب را پیش از رسیدن سوخت به سیستم انژکتور حذف می‌کند.",
      stock: 0,
    },
  };

  const products: Record<string, Awaited<ReturnType<typeof prisma.product.create>>> = {};
  for (const [key, seed] of Object.entries(productSeeds)) {
    const { stock, ...productData } = seed;
    const product = await prisma.product.create({
      data: { ...productData, status: "ACTIVE" },
    });
    products[key] = product;
    await prisma.inventory.create({
      data: { productId: product.id, stock, lastUpdatedAt: new Date() },
    });
  }

  // ---------------------------------------------------------------------
  // Car Brands / Models / Engines
  // ---------------------------------------------------------------------

  type EngineSeed = {
    labelEn: string;
    labelFa: string;
    yearStart: number;
    yearEnd?: number;
    fuelType: FuelType;
    displacementCc: number;
    engineCode: string;
    oilPlan: "dual" | "standard" | "specOnly";
  };
  type ModelSeed = { nameEn: string; nameFa: string; slug: string; engines: EngineSeed[] };
  type CarBrandSeed = { nameEn: string; nameFa: string; slug: string; models: ModelSeed[] };

  const carBrandSeeds: CarBrandSeed[] = [
    {
      nameEn: "Toyota",
      nameFa: "تویوتا",
      slug: "toyota",
      models: [
        {
          nameEn: "Corolla",
          nameFa: "کرولا",
          slug: "corolla",
          engines: [
            {
              labelEn: "1.6L Dual VVT-i Petrol",
              labelFa: "۱.۶ لیتر بنزینی دوگانه VVT-i",
              yearStart: 2018,
              yearEnd: 2022,
              fuelType: FuelType.PETROL,
              displacementCc: 1600,
              engineCode: "1ZR-FE",
              oilPlan: "dual",
            },
            {
              labelEn: "1.8L VVT-i Petrol",
              labelFa: "۱.۸ لیتر بنزینی VVT-i",
              yearStart: 2015,
              yearEnd: 2017,
              fuelType: FuelType.PETROL,
              displacementCc: 1800,
              engineCode: "2ZR-FE",
              oilPlan: "standard",
            },
          ],
        },
        {
          nameEn: "Camry",
          nameFa: "کمری",
          slug: "camry",
          engines: [
            {
              labelEn: "2.5L Dual VVT-i Petrol",
              labelFa: "۲.۵ لیتر بنزینی دوگانه VVT-i",
              yearStart: 2015,
              yearEnd: 2020,
              fuelType: FuelType.PETROL,
              displacementCc: 2500,
              engineCode: "2AR-FE",
              oilPlan: "standard",
            },
          ],
        },
      ],
    },
    {
      nameEn: "Peugeot",
      nameFa: "پژو",
      slug: "peugeot",
      models: [
        {
          nameEn: "206",
          nameFa: "۲۰۶",
          slug: "206",
          engines: [
            {
              labelEn: "1.4L TU3 Petrol",
              labelFa: "۱.۴ لیتر بنزینی TU3",
              yearStart: 2000,
              yearEnd: 2010,
              fuelType: FuelType.PETROL,
              displacementCc: 1400,
              engineCode: "TU3A",
              oilPlan: "specOnly",
            },
          ],
        },
        {
          nameEn: "Pars",
          nameFa: "پارس",
          slug: "pars",
          engines: [
            {
              labelEn: "1.8L XU7 Petrol",
              labelFa: "۱.۸ لیتر بنزینی XU7",
              yearStart: 2000,
              yearEnd: 2015,
              fuelType: FuelType.PETROL,
              displacementCc: 1800,
              engineCode: "XU7P",
              oilPlan: "standard",
            },
            {
              labelEn: "2.0L EF7 Petrol",
              labelFa: "۲.۰ لیتر بنزینی EF7",
              yearStart: 2016,
              yearEnd: 2020,
              fuelType: FuelType.PETROL,
              displacementCc: 2000,
              engineCode: "EF7",
              oilPlan: "standard",
            },
          ],
        },
      ],
    },
    {
      nameEn: "Hyundai",
      nameFa: "هیوندای",
      slug: "hyundai",
      models: [
        {
          nameEn: "Elantra",
          nameFa: "النترا",
          slug: "elantra",
          engines: [
            {
              labelEn: "1.8L Nu Petrol",
              labelFa: "۱.۸ لیتر بنزینی نو",
              yearStart: 2016,
              yearEnd: 2020,
              fuelType: FuelType.PETROL,
              displacementCc: 1800,
              engineCode: "G4NB",
              oilPlan: "standard",
            },
          ],
        },
        {
          nameEn: "Tucson",
          nameFa: "توسان",
          slug: "tucson",
          engines: [
            {
              labelEn: "2.0L Nu Petrol",
              labelFa: "۲.۰ لیتر بنزینی نو",
              yearStart: 2016,
              yearEnd: 2021,
              fuelType: FuelType.PETROL,
              displacementCc: 2000,
              engineCode: "G4NA",
              oilPlan: "dual",
            },
            {
              labelEn: "2.0L CRDi Diesel",
              labelFa: "۲.۰ لیتر دیزل CRDi",
              yearStart: 2016,
              yearEnd: 2021,
              fuelType: FuelType.DIESEL,
              displacementCc: 2000,
              engineCode: "D4HA",
              oilPlan: "standard",
            },
          ],
        },
      ],
    },
  ];

  type CreatedEngine = Awaited<ReturnType<typeof prisma.carEngine.create>> & { oilPlan: EngineSeed["oilPlan"] };
  const engines: CreatedEngine[] = [];
  let peugeot206EngineId = "";

  for (const carBrandSeed of carBrandSeeds) {
    const carBrand = await prisma.carBrand.create({
      data: {
        slug: carBrandSeed.slug,
        nameEn: carBrandSeed.nameEn,
        nameFa: carBrandSeed.nameFa,
        status: "ACTIVE",
      },
    });

    for (const modelSeed of carBrandSeed.models) {
      const carModel = await prisma.carModel.create({
        data: {
          carBrandId: carBrand.id,
          nameEn: modelSeed.nameEn,
          nameFa: modelSeed.nameFa,
          slug: modelSeed.slug,
          status: "ACTIVE",
        },
      });

      for (const engineSeed of modelSeed.engines) {
        const { oilPlan, ...engineData } = engineSeed;
        const carEngine = await prisma.carEngine.create({
          data: { ...engineData, carModelId: carModel.id, status: "ACTIVE" },
        });
        engines.push({ ...carEngine, oilPlan });
        if (carBrandSeed.slug === "peugeot" && modelSeed.slug === "206") {
          peugeot206EngineId = carEngine.id;
        }
      }
    }
  }

  // ---------------------------------------------------------------------
  // Fitment Recommendations
  // ---------------------------------------------------------------------

  for (const [index, engine] of engines.entries()) {
    if (engine.oilPlan === "dual") {
      await prisma.fitmentRecommendation.create({
        data: {
          carEngineId: engine.id,
          categoryId: engineOil.id,
          climate: FitmentClimate.HOT,
          productId: products.mobilOil0w40.id,
          priority: 1,
        },
      });
      await prisma.fitmentRecommendation.create({
        data: {
          carEngineId: engine.id,
          categoryId: engineOil.id,
          climate: FitmentClimate.COLD,
          productId: products.castrolOil0w20.id,
          priority: 1,
        },
      });
    } else if (engine.oilPlan === "standard") {
      await prisma.fitmentRecommendation.create({
        data: {
          carEngineId: engine.id,
          categoryId: engineOil.id,
          climate: FitmentClimate.STANDARD,
          productId: index % 2 === 0 ? products.mobilOil5w30.id : products.castrolOil5w40.id,
        },
      });
    } else {
      await prisma.fitmentRecommendation.create({
        data: {
          carEngineId: engine.id,
          categoryId: engineOil.id,
          climate: FitmentClimate.STANDARD,
          productId: null,
          specNote:
            "No catalog match yet — needs 5W-30 (or 10W-40) semi-synthetic oil, API SL or newer. Verify against owner's manual.",
          specAttributes: { viscosity: "5W-30 or 10W-40", apiRating: "API SL or newer" },
        },
      });
    }

    await prisma.fitmentRecommendation.create({
      data: {
        carEngineId: engine.id,
        categoryId: oilFilter.id,
        climate: FitmentClimate.STANDARD,
        productId: index % 2 === 0 ? products.boschOilFilter.id : products.mannOilFilter.id,
      },
    });
    await prisma.fitmentRecommendation.create({
      data: {
        carEngineId: engine.id,
        categoryId: airFilter.id,
        climate: FitmentClimate.STANDARD,
        productId: index % 2 === 0 ? products.boschAirFilter.id : products.mannAirFilter.id,
      },
    });
    await prisma.fitmentRecommendation.create({
      data: {
        carEngineId: engine.id,
        categoryId: cabinFilter.id,
        climate: FitmentClimate.STANDARD,
        productId: products.boschCabinFilter.id,
      },
    });
    await prisma.fitmentRecommendation.create({
      data: {
        carEngineId: engine.id,
        categoryId: fuelFilter.id,
        climate: FitmentClimate.STANDARD,
        productId: products.mannFuelFilter.id,
      },
    });
  }

  // ---------------------------------------------------------------------
  // Fitment Inquiries
  // ---------------------------------------------------------------------

  await prisma.fitmentInquiry.create({
    data: {
      carEngineId: peugeot206EngineId,
      categoryId: engineOil.id,
      customerName: "Amir Rezaei",
      phone: "+989121234567",
      email: "amir.rezaei@example.com",
      message: "Couldn't find a catalog oil match for my Peugeot 206 — can you help me source the right grade?",
      status: FitmentInquiryStatus.NEW,
    },
  });

  const tucsonDieselEngine = engines.find((engine) => engine.engineCode === "D4HA");
  await prisma.fitmentInquiry.create({
    data: {
      carEngineId: tucsonDieselEngine?.id,
      categoryId: fuelFilter.id,
      customerName: "Sara Ahmadi",
      phone: "+989351112233",
      message: "Looking for a fuel filter for my Hyundai Tucson diesel.",
      status: FitmentInquiryStatus.CONTACTED,
      adminNote: "Called customer, confirmed compatible Mann-Filter WK820 in stock.",
    },
  });

  // ---------------------------------------------------------------------
  // Orders
  // ---------------------------------------------------------------------

  type OrderItemSeed = { product: typeof products.mobilOil5w30; quantity: number };
  type OrderSeed = {
    customer: (typeof customers)[number];
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    shippingAddress: string;
    postalCode: string;
    adminNote?: string;
    items: OrderItemSeed[];
  };

  const orderSeeds: OrderSeed[] = [
    {
      customer: customers[0],
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.UNPAID,
      shippingAddress: "No. 24, Vali-e-Asr St., Tehran",
      postalCode: "1415673111",
      items: [
        { product: products.mobilOil5w30, quantity: 2 },
        { product: products.boschOilFilter, quantity: 1 },
      ],
    },
    {
      customer: customers[1],
      status: OrderStatus.SENDING,
      paymentStatus: PaymentStatus.PAID,
      shippingAddress: "No. 8, Ferdowsi Ave., Mashhad",
      postalCode: "9137913111",
      items: [
        { product: products.castrolOil0w20, quantity: 1 },
        { product: products.mannAirFilter, quantity: 1 },
        { product: products.boschCabinFilter, quantity: 1 },
      ],
    },
    {
      customer: customers[2],
      status: OrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.PAID,
      shippingAddress: "No. 112, Zand Blvd., Shiraz",
      postalCode: "7134815111",
      items: [{ product: products.mobilOil0w40, quantity: 1 }],
    },
    {
      customer: customers[3],
      status: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.REFUNDED,
      shippingAddress: "No. 5, Chamran Highway, Isfahan",
      postalCode: "8165813111",
      adminNote: "Customer cancelled before dispatch; refunded in full.",
      items: [
        { product: products.castrolOil5w40, quantity: 2 },
        { product: products.mannOilFilter, quantity: 2 },
      ],
    },
    {
      customer: customers[4],
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.UNPAID,
      shippingAddress: "No. 61, Azadi St., Karaj",
      postalCode: "3134715111",
      items: [
        { product: products.mannFuelFilter, quantity: 1 },
        { product: products.boschAirFilter, quantity: 1 },
        { product: products.mobilOil5w30, quantity: 1 },
      ],
    },
  ];

  for (const orderSeed of orderSeeds) {
    const itemsData = orderSeed.items.map(({ product, quantity }) => {
      const priceSnapshot = finalPrice(Number(product.price), product.discountPercent);
      return {
        productId: product.id,
        productNameSnapshot: product.nameEn,
        priceSnapshot,
        quantity,
        lineTotal: priceSnapshot * quantity,
      };
    });
    const subtotal = itemsData.reduce((sum, item) => sum + item.lineTotal, 0);
    const discount = 0;
    const tax = 0;
    const total = subtotal - discount + SHIPPING_COST + tax;

    await prisma.order.create({
      data: {
        customerId: orderSeed.customer.id,
        status: orderSeed.status,
        paymentStatus: orderSeed.paymentStatus,
        subtotal,
        discount,
        shippingCost: SHIPPING_COST,
        tax,
        total,
        shippingAddress: orderSeed.shippingAddress,
        postalCode: orderSeed.postalCode,
        adminNote: orderSeed.adminNote,
        items: { create: itemsData },
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
