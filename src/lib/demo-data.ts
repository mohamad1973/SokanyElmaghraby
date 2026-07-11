import type { Category, Product } from "./types";

export const categories: Category[] = [
  {
    id: 1,
    name: "أجهزة المطبخ",
    slug: "kitchen-supplies",
    description: "خلاطات، قلايات، غلايات، أجهزة تحضير الطعام وكل ما يحتاجه البيت.",
    productCount: 38,
  },
  {
    id: 2,
    name: "العناية الشخصية",
    slug: "personal-care",
    description: "استشوار، فرش حرارية، ماكينات حلاقة وأجهزة عناية يومية.",
    productCount: 24,
  },
  {
    id: 3,
    name: "أجهزة منزلية",
    slug: "home-appliances",
    description: "تنظيف بالبخار، مكانس، مراوح وأجهزة عملية بضمان الوكيل.",
    productCount: 19,
  },
  {
    id: 4,
    name: "عروض سوكاني",
    slug: "offers",
    description: "منتجات مختارة بسعر منافس وشحن سريع داخل مصر.",
    productCount: 12,
  },
];

export const products: Product[] = [
  {
    id: 101,
    name: "SK-10071 فرن سوكاني 3 في 1 25 لتر 3000 وات",
    slug: "sk-10071-oven-25l",
    sku: "SK-10071",
    price: "2,650",
    regularPrice: "2,950",
    salePrice: "2,650",
    image: "/product-placeholder.svg",
    category: "أجهزة المطبخ",
    categorySlug: "kitchen-supplies",
    shortDescription:
      "فرن عملي للعائلة بقدرة قوية وتصميم مناسب للاستخدام اليومي.",
    description:
      "فرن سوكاني 25 لتر يجمع بين التسخين السريع والتحكم العملي، مناسب للمخبوزات والوجبات اليومية مع ضمان مؤسسة المغربي.",
    stockStatus: "instock",
    rating: "4.8",
    featured: true,
    attributes: {
      القدرة: "3000 وات",
      السعة: "25 لتر",
      الضمان: "عام ضد عيوب الصناعة",
    },
  },
  {
    id: 102,
    name: "SK-09087 غلاية زجاج سوكاني 1.7 لتر 1500 وات",
    slug: "sk-09087-glass-kettle",
    sku: "SK-09087",
    price: "780",
    regularPrice: "890",
    salePrice: "780",
    image: "/product-placeholder.svg",
    category: "أجهزة المطبخ",
    categorySlug: "kitchen-supplies",
    shortDescription:
      "غلاية زجاج سريعة الغليان بتصميم أنيق وسعة مناسبة للاستخدام اليومي.",
    description:
      "غلاية سوكاني زجاجية بسعة 1.7 لتر وقدرة 1500 وات، مناسبة للبيت والمكتب مع قاعدة سهلة الاستخدام.",
    stockStatus: "instock",
    rating: "4.7",
    featured: true,
    attributes: {
      القدرة: "1500 وات",
      السعة: "1.7 لتر",
      الخامة: "زجاج مقاوم للحرارة",
    },
  },
  {
    id: 103,
    name: "SK-15061N فرشة استشوار سوكاني 1200 وات بجراب",
    slug: "sk-15061n-hot-air-brush",
    sku: "SK-15061N",
    price: "1,150",
    regularPrice: "1,350",
    salePrice: "1,150",
    image: "/product-placeholder.svg",
    category: "العناية الشخصية",
    categorySlug: "personal-care",
    shortDescription:
      "فرشة استشوار عملية لتجفيف وتصفيف الشعر بسرعة مع جراب للحفظ.",
    description:
      "فرشة استشوار سوكاني 1200 وات مناسبة للتصفيف اليومي، بتصميم مريح وجراب عملي للحفظ والتنقل.",
    stockStatus: "instock",
    rating: "4.9",
    featured: true,
    attributes: {
      القدرة: "1200 وات",
      الاستخدام: "تجفيف وتصفيف",
      الملحقات: "جراب",
    },
  },
  {
    id: 104,
    name: "SK-13089 مساحة كهربائية بالبخار سوكاني 1800 وات",
    slug: "sk-13089-steam-mop",
    sku: "SK-13089",
    price: "2,250",
    regularPrice: "2,450",
    salePrice: "2,250",
    image: "/product-placeholder.svg",
    category: "أجهزة منزلية",
    categorySlug: "home-appliances",
    shortDescription:
      "تنظيف بالبخار للأرضيات والأسطح مع قدرة عالية للاستخدام المنزلي.",
    description:
      "مساحة كهربائية بالبخار من سوكاني بقدرة 1800 وات، تساعد على تنظيف أسرع وأعمق مع ضمان الوكيل الحصري.",
    stockStatus: "instock",
    rating: "4.6",
    featured: true,
    attributes: {
      القدرة: "1800 وات",
      النوع: "تنظيف بالبخار",
      الضمان: "عام ضد عيوب الصناعة",
    },
  },
  {
    id: 105,
    name: "SK-16081 ماكينة سوكاني ديجيتال",
    slug: "sk-16081-digital-clipper",
    sku: "SK-16081",
    price: "980",
    image: "/product-placeholder.svg",
    category: "العناية الشخصية",
    categorySlug: "personal-care",
    shortDescription:
      "ماكينة عناية ديجيتال بتصميم عملي وشحن مناسب للاستخدام المتكرر.",
    description:
      "ماكينة سوكاني ديجيتال للعناية الشخصية، مناسبة للاستخدام المنزلي وتأتي بضمان مؤسسة المغربي.",
    stockStatus: "instock",
    rating: "4.7",
    attributes: {
      النوع: "ديجيتال",
      الشحن: "USB",
      الضمان: "عام ضد عيوب الصناعة",
    },
  },
  {
    id: 106,
    name: "SK-13065 ماكينة تنظيف بقع الانتريه والسجاد 1800 وات",
    slug: "sk-13065-spot-cleaner",
    sku: "SK-13065",
    price: "3,750",
    image: "/product-placeholder.svg",
    category: "أجهزة منزلية",
    categorySlug: "home-appliances",
    shortDescription:
      "حل قوي لتنظيف بقع السجاد والانتريه داخل البيت بسهولة.",
    description:
      "ماكينة تنظيف بقع سوكاني مناسبة للسجاد والانتريه، بقدرة 1800 وات وسعة عملية للاستخدام المنزلي.",
    stockStatus: "onbackorder",
    rating: "4.8",
    attributes: {
      القدرة: "1800 وات",
      السعة: "1.08 لتر",
      الاستخدام: "سجاد وانتريه",
    },
  },
];

export const featuredProducts = products.filter((product) => product.featured);

