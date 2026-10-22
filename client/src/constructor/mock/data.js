// Демонстрационные базы для конструктора. Живут в браузере, сервер не нужен.
// Данные одинаковы при каждой загрузке (фиксированное зерно генератора).

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = rng(2026);
const int = (min, max) => Math.floor(random() * (max - min + 1)) + min;
const pick = list => list[int(0, list.length - 1)];
const chance = p => random() < p;
const round2 = n => Math.round(n * 100) / 100;

const BASE_DATE = Date.UTC(2026, 5, 30); // 30.06.2026
function isoDate(daysAgo) {
  return new Date(BASE_DATE - daysAgo * 86400000).toISOString().slice(0, 10);
}

const REGIONS = [
  ['Москва', ['Москва'], 1.15], ['Санкт-Петербург', ['Санкт-Петербург'], 1.08],
  ['Новосибирская область', ['Новосибирск', 'Бердск'], 0.98],
  ['Свердловская область', ['Екатеринбург', 'Нижний Тагил'], 1.0],
  ['Татарстан', ['Казань', 'Набережные Челны'], 0.96],
  ['Краснодарский край', ['Краснодар', 'Сочи'], 1.04],
  ['Нижегородская область', ['Нижний Новгород', 'Дзержинск'], 0.97],
  ['Самарская область', ['Самара', 'Тольятти'], 0.95],
  ['Ростовская область', ['Ростов-на-Дону', 'Таганрог'], 0.96],
  ['Красноярский край', ['Красноярск', 'Норильск'], 1.12],
];
const CHAINS = [['Пятёрочка', 0.97], ['Магнит', 0.96], ['Перекрёсток', 1.08], ['Лента', 0.99], ['ВкусВилл', 1.22], ['Дикси', 0.94], ['Ашан', 1.0]];
const STREETS = ['ул. Ленина', 'пр. Мира', 'ул. Гагарина', 'ул. Советская', 'ул. Пушкина', 'пр. Победы', 'ул. Садовая', 'ул. Кирова'];

// [название, категория, единица, базовая цена, органический]
const PRODUCT_LIST = [
  ['Молоко 3,2%', 'Молочные', 'л', 89, false], ['Кефир 2,5%', 'Молочные', 'л', 84, false],
  ['Сметана 20%', 'Молочные', 'шт', 72, false], ['Творог 5%', 'Молочные', 'шт', 98, true],
  ['Сыр Российский', 'Молочные', 'кг', 640, false], ['Йогурт натуральный', 'Молочные', 'шт', 54, true],
  ['Хлеб белый', 'Хлеб', 'шт', 48, false], ['Хлеб бородинский', 'Хлеб', 'шт', 62, false],
  ['Батон нарезной', 'Хлеб', 'шт', 45, false], ['Булочка с маком', 'Хлеб', 'шт', 38, false],
  ['Картофель', 'Овощи', 'кг', 42, true], ['Морковь', 'Овощи', 'кг', 38, true],
  ['Помидоры', 'Овощи', 'кг', 210, false], ['Огурцы', 'Овощи', 'кг', 150, false],
  ['Капуста белокочанная', 'Овощи', 'кг', 32, true],
  ['Яблоки', 'Фрукты', 'кг', 120, true], ['Бананы', 'Фрукты', 'кг', 95, false],
  ['Апельсины', 'Фрукты', 'кг', 130, false], ['Груши', 'Фрукты', 'кг', 175, true],
  ['Куриное филе', 'Мясо', 'кг', 380, false], ['Говядина', 'Мясо', 'кг', 720, false],
  ['Свинина', 'Мясо', 'кг', 460, false], ['Фарш домашний', 'Мясо', 'кг', 410, false],
  ['Гречка', 'Бакалея', 'кг', 98, false], ['Рис круглозёрный', 'Бакалея', 'кг', 105, false],
  ['Макароны', 'Бакалея', 'шт', 69, false], ['Сахар', 'Бакалея', 'кг', 74, false],
  ['Мука пшеничная', 'Бакалея', 'кг', 66, false],
  ['Вода питьевая', 'Напитки', 'л', 32, false], ['Сок яблочный', 'Напитки', 'л', 115, false],
  ['Чай чёрный', 'Напитки', 'шт', 160, false], ['Кофе молотый', 'Напитки', 'шт', 340, false],
  ['Шоколад молочный', 'Сладости', 'шт', 95, false], ['Печенье овсяное', 'Сладости', 'шт', 78, false],
  ['Зефир', 'Сладости', 'шт', 130, false],
];

const SUPPLIER_NAMES = [
  'Молокозавод №1', 'Агрокомплекс «Сибирь»', 'Хлебозавод «Колос»', 'ТД «Овощной рай»',
  'Мясокомбинат «Урал»', 'Крупа-Опт', 'Фруктовая база «Юг»', 'Напитки Поволжья',
  'Кондитерская фабрика «Заря»', 'Птицефабрика «Берёзовая»', 'Сыроварня «Алтай»',
  'ООО «Продснаб»', 'Агрохолдинг «Дон»', 'Рыбный двор', 'Масложиркомбинат «Кама»',
];
const STATUSES = ['Доставлено', 'Доставлено', 'Доставлено', 'Доставлено', 'Доставлено', 'В пути', 'В пути', 'Задержана', 'Отменена'];
const FIRST = ['Иван', 'Пётр', 'Сергей', 'Алексей', 'Дмитрий', 'Андрей', 'Николай', 'Михаил'];
const LAST = ['Иванов', 'Петров', 'Сидоров', 'Кузнецов', 'Смирнов', 'Попов', 'Васильев', 'Морозов'];

// --- Магазины ---
const stores = [];
const storeFactor = [];
for (const [region, cities, regionFactor] of REGIONS) {
  for (let k = 0; k < 4; k++) {
    const [chain, chainFactor] = CHAINS[(stores.length + k) % CHAINS.length];
    stores.push({
      id: stores.length + 1,
      name: chain,
      region,
      address: `г. ${pick(cities)}, ${pick(STREETS)}, ${int(1, 120)}`,
      opened_on: isoDate(int(200, 3500)),
      is_24h: chance(0.25),
      area_m2: chance(0.1) ? null : int(120, 2400),
    });
    storeFactor.push(regionFactor * chainFactor);
  }
}

const products = PRODUCT_LIST.map(([name, category, unit, price, organic], i) => ({
  id: i + 1,
  name,
  category,
  unit,
  price,
  is_organic: organic,
  produced_on: chance(0.15) ? null : isoDate(int(1, 60)),
}));

const sales = [];
for (let i = 0; i < 1500; i++) {
  const store = pick(stores);
  const product = pick(products);
  const quantity = int(1, 40);
  const factor = storeFactor[store.id - 1] * (0.93 + random() * 0.14);
  sales.push({
    id: i + 1,
    store_id: store.id,
    product_id: product.id,
    sold_on: isoDate(int(0, 364)),
    quantity,
    amount: round2(quantity * product.price * factor),
  });
}

// --- Логистика ---
const suppliers = SUPPLIER_NAMES.map((name, i) => ({
  id: i + 1,
  name,
  contact_phone: `+7(${int(900, 999)})${int(100, 999)}-${int(10, 99)}-${int(10, 99)}`,
  rating: round2(3 + random() * 2),
  is_certified: chance(0.7),
}));

const deliveries = [];
for (let i = 0; i < 240; i++) {
  const daysAgo = int(-30, 365); // отрицательные значения: запланированные поставки
  deliveries.push({
    id: i + 1,
    supplier_id: pick(suppliers).id,
    delivery_date: isoDate(daysAgo),
    status: daysAgo < 0 ? 'В пути' : pick(STATUSES),
    weight_kg: chance(0.05) ? null : round2(50 + random() * 4950),
    is_urgent: chance(0.18),
    driver_name: `${pick(LAST)} ${pick(FIRST)}`,
  });
}

const col = (name, type) => ({ name, type });

export const MOCK_DATABASES = {
  demo_stores: {
    label: 'Демо: магазины',
    tables: {
      stores: {
        columns: [col('id', 'integer'), col('name', 'character varying'), col('region', 'character varying'),
          col('address', 'text'), col('opened_on', 'date'), col('is_24h', 'boolean'), col('area_m2', 'integer')],
        rows: stores,
      },
      products: {
        columns: [col('id', 'integer'), col('name', 'character varying'), col('category', 'character varying'),
          col('unit', 'character varying'), col('price', 'numeric'), col('is_organic', 'boolean'), col('produced_on', 'date')],
        rows: products,
      },
      sales: {
        columns: [col('id', 'integer'), col('store_id', 'integer'), col('product_id', 'integer'),
          col('sold_on', 'date'), col('quantity', 'integer'), col('amount', 'numeric')],
        rows: sales,
      },
    },
  },
  demo_logistics: {
    label: 'Демо: логистика',
    tables: {
      suppliers: {
        columns: [col('id', 'integer'), col('name', 'character varying'), col('contact_phone', 'character varying'),
          col('rating', 'numeric'), col('is_certified', 'boolean')],
        rows: suppliers,
      },
      deliveries: {
        columns: [col('id', 'integer'), col('supplier_id', 'integer'), col('delivery_date', 'date'),
          col('status', 'character varying'), col('weight_kg', 'numeric'), col('is_urgent', 'boolean'),
          col('driver_name', 'character varying')],
        rows: deliveries,
      },
    },
  },
};
