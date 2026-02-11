from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
from datetime import datetime, timedelta
from functools import wraps
import os
import io
import csv
import json
import re

app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'predprof2026')

DATABASE = os.environ.get('CANTEEN_DB', 'canteen.db')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPORTS_DIR = os.environ.get('CANTEEN_REPORTS_DIR', os.path.join(BASE_DIR, 'reports'))

MEAL_CONSUMPTION = {
    'breakfast': {
        'Яйца': 1,      
        'Молоко': 0.2,  
        'Мука': 0.1     
    },
    'lunch': {
        'Молоко': 0.1,  
        'Мука': 0.2     
    }
}


DEFAULT_DISH_RECIPES = {
    'Овсяная каша': [
        ('Овсяные хлопья', 0.08),
        ('Молоко', 0.25),
        ('Мёд', 0.01),
        ('Орехи', 0.01),
        ('Соль', 0.002),
    ],
    'Омлет': [
        ('Яйца', 2),
        ('Молоко', 0.10),
        ('Сыр', 0.03),
        ('Помидоры', 0.05),
        ('Соль', 0.002),
    ],
    'Сырники': [
        ('Творог', 0.15),
        ('Яйца', 1),
        ('Мука', 0.05),
        ('Сахар', 0.01),
        ('Сметана', 0.03),
    ],
    'Блинчики с творогом': [
        ('Мука', 0.07),
        ('Молоко', 0.20),
        ('Яйца', 1),
        ('Творог', 0.12),
        ('Сгущённое молоко', 0.05),
    ],
    'Гречневая каша': [
        ('Гречка', 0.08),
        ('Сливочное масло', 0.01),
        ('Соль', 0.002),
    ],
    'Рисовая каша': [
        ('Рис', 0.08),
        ('Молоко', 0.25),
        ('Сахар', 0.01),
        ('Соль', 0.002),
    ],
    'Йогурт с мюсли': [
        ('Йогурт натуральный', 0.20),
        ('Мюсли', 0.05),
    ],
    'Фруктовый салат': [
        ('Яблоки', 0.10),
        ('Бананы', 0.10),
        ('Апельсины', 0.10),
    ],
    'Сэндвич с курицей': [
        ('Тостовый хлеб', 2),
        ('Куриное филе', 0.10),
        ('Сыр', 0.02),
        ('Помидоры', 0.05),
        ('Зелень', 0.005),
    ],

    'Борщ': [
        ('Свёкла', 0.06),
        ('Капуста', 0.05),
        ('Картофель', 0.08),
        ('Морковь', 0.03),
        ('Лук', 0.02),
        ('Томатная паста', 0.01),
        ('Говядина', 0.05),
        ('Сметана', 0.03),
        ('Соль', 0.003),
    ],
    'Котлета с пюре': [
        ('Фарш мясной', 0.12),
        ('Мука', 0.02),
        ('Яйца', 1),
        ('Картофель', 0.20),
        ('Молоко', 0.05),
        ('Сливочное масло', 0.01),
        ('Соль', 0.003),
    ],
    'Суп куриный': [
        ('Куриное филе', 0.07),
        ('Лапша', 0.05),
        ('Морковь', 0.03),
        ('Лук', 0.02),
        ('Зелень', 0.005),
        ('Соль', 0.003),
    ],
    'Суп-пюре овощной': [
        ('Картофель', 0.10),
        ('Морковь', 0.04),
        ('Лук', 0.02),
        ('Молоко', 0.05),
        ('Сливочное масло', 0.01),
        ('Соль', 0.003),
    ],
    'Салат овощной': [
        ('Помидоры', 0.10),
        ('Огурцы', 0.10),
        ('Зелень', 0.005),
        ('Растительное масло', 0.01),
        ('Соль', 0.002),
    ],
    'Плов с курицей': [
        ('Куриное филе', 0.12),
        ('Рис', 0.10),
        ('Морковь', 0.05),
        ('Лук', 0.03),
        ('Чеснок', 0.002),
        ('Растительное масло', 0.01),
        ('Соль', 0.003),
    ],
    'Рыба с рисом': [
        ('Рыбное филе', 0.15),
        ('Рис', 0.10),
        ('Сливочное масло', 0.01),
        ('Соль', 0.003),
    ],
    'Паста болоньезе': [
        ('Макароны', 0.12),
        ('Фарш мясной', 0.10),
        ('Томатная паста', 0.02),
        ('Лук', 0.03),
        ('Сыр', 0.02),
        ('Растительное масло', 0.01),
        ('Соль', 0.003),
    ],
    'Тефтели с гречкой': [
        ('Фарш мясной', 0.12),
        ('Рис', 0.03),
        ('Яйца', 1),
        ('Мука', 0.02),
        ('Гречка', 0.10),
        ('Томатная паста', 0.01),
        ('Лук', 0.03),
        ('Соль', 0.003),
    ],
}

ALLOWED_ALLERGENS = [
    'молоко',
    'яйца',
    'глютен',
    'орехи',
    'арахис',
    'рыба',
    'морепродукты',
    'соя',
    'кунжут'
]


CLASS_NAME_RE = re.compile(r"^\s*(\d{1,2})\s*[- ]?\s*([A-Za-zА-Яа-я])\s*$")


def normalize_class_name(value: str) -> str:
    raw = (value or '').strip()
    if not raw:
        return ''
    m = CLASS_NAME_RE.match(raw)
    if not m:
        return ''
    try:
        num = int(m.group(1))
    except Exception:
        return ''
    letter = (m.group(2) or '').strip().upper()
    if num < 1 or num > 11:
        return ''
    return f"{num}{letter}"


def parse_iso_date(value: str):
    """Парсит дату в формате YYYY-MM-DD. Возвращает date или None."""
    s = (value or '').strip()
    if not s:
        return None
    try:
        return datetime.strptime(s, '%Y-%m-%d').date()
    except Exception:
        return None

def get_db():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    return db


def get_app_setting(cursor, key: str, default=None):
    """Читает значение из app_settings. Возвращает default, если ключа нет."""
    try:
        row = cursor.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    except Exception:
        return default
    if not row:
        return default
    try:
        return row['value']
    except Exception:
        try:
            return row[0]
        except Exception:
            return default


def set_app_setting(cursor, key: str, value) -> None:
    cursor.execute(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, str(value))
    )


def _parse_float(value, default=None):
    try:
        return float(value)
    except Exception:
        return default


def get_subscription_day_price(cursor, meal_type: str) -> float:
    key_map = {
        'breakfast': 'subscription_price_breakfast',
        'lunch': 'subscription_price_lunch',
        'both': 'subscription_price_both'
    }
    key = key_map.get(meal_type)
    if not key:
        return 0.0

    val = _parse_float(get_app_setting(cursor, key, None), None)

    if val is None:
        try:
            b = _meal_price(cursor, 'breakfast')
            l = _meal_price(cursor, 'lunch')
            if meal_type == 'breakfast':
                val = b
            elif meal_type == 'lunch':
                val = l
            else:
                val = (b or 0) + (l or 0)
        except Exception:
            val = 0.0

    try:
        val = float(val or 0)
    except Exception:
        val = 0.0

    if val < 0:
        val = 0.0
    return val

def ensure_column(cursor, table, column, col_def):
    cols = cursor.execute(f"PRAGMA table_info({table})").fetchall()
    col_names = [c['name'] if isinstance(c, sqlite3.Row) else c[1] for c in cols]
    if column not in col_names:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")


def normalize_allergen(value: str) -> str:
    return (value or '').strip().lower()


def dedupe_products(cursor):
    groups = cursor.execute(
        "SELECT name, unit, MIN(id) AS keep_id FROM products GROUP BY name, unit"
    ).fetchall()

    for g in groups:
        name = g['name']
        unit = g['unit']
        keep_id = int(g['keep_id'])

        drop_ids = cursor.execute(
            "SELECT id FROM products WHERE name = ? AND unit = ? AND id <> ?",
            (name, unit, keep_id)
        ).fetchall()

        for d in drop_ids:
            drop_id = int(d['id'])
            try:
                cursor.execute(
                    "UPDATE purchase_requests SET product_id = ? WHERE product_id = ?",
                    (keep_id, drop_id)
                )
            except Exception:
                pass

        cursor.execute(
            "DELETE FROM products WHERE name = ? AND unit = ? AND id <> ?",
            (name, unit, keep_id)
        )


def dedupe_menu_items(cursor):
    groups = cursor.execute(
        "SELECT name, category, MIN(id) AS keep_id FROM menu_items GROUP BY name, category"
    ).fetchall()

    for g in groups:
        name = g['name']
        category = g['category']
        keep_id = int(g['keep_id'])

        drop_ids = cursor.execute(
            "SELECT id FROM menu_items WHERE name = ? AND category = ? AND id <> ?",
            (name, category, keep_id)
        ).fetchall()

        for d in drop_ids:
            drop_id = int(d['id'])
            try:
                cursor.execute(
                    "UPDATE reviews SET menu_item_id = ? WHERE menu_item_id = ?",
                    (keep_id, drop_id)
                )
            except Exception:
                pass

            try:
                cursor.execute(
                    "UPDATE meal_claims SET menu_item_id = ? WHERE menu_item_id = ?",
                    (keep_id, drop_id)
                )
            except Exception:
                pass

            try:
                cursor.execute(
                    "UPDATE menu_schedule SET menu_item_id = ? WHERE menu_item_id = ?",
                    (keep_id, drop_id)
                )
            except Exception:
                pass

        cursor.execute(
            "DELETE FROM menu_items WHERE name = ? AND category = ? AND id <> ?",
            (name, category, keep_id)
        )



def dedupe_allergies(cursor):
    groups = cursor.execute(
        "SELECT user_id, allergen, MIN(id) AS keep_id FROM allergies GROUP BY user_id, allergen"
    ).fetchall()

    for g in groups:
        user_id = int(g['user_id'])
        allergen = g['allergen']
        keep_id = int(g['keep_id'])

        cursor.execute(
            "DELETE FROM allergies WHERE user_id = ? AND allergen = ? AND id <> ?",
            (user_id, allergen, keep_id)
        )


def ensure_unique_indexes(cursor):
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_unit ON products(name, unit)"
    )
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_items_name_category ON menu_items(name, category)"
    )
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_allergies_user_allergen ON allergies(user_id, allergen)"
    )

def _iter_dates(start_date, end_date):
    d = start_date
    while d <= end_date:
        yield d
        d += timedelta(days=1)


def seed_default_menu_schedule(cursor, start_date, end_date, per_day: int = 3):
    """Заполняет расписание меню (menu_schedule) демо-данными.

    По умолчанию добавляет несколько позиций на каждый день (per_day на завтрак и per_day на обед),
    чтобы у ученика был выбор. Использует INSERT OR IGNORE, поэтому безопасно вызывать повторно.
    """
    try:
        breakfast_rows = cursor.execute(
            "SELECT id FROM menu_items WHERE category = 'breakfast' AND available = 1 ORDER BY id"
        ).fetchall()
        lunch_rows = cursor.execute(
            "SELECT id FROM menu_items WHERE category = 'lunch' AND available = 1 ORDER BY id"
        ).fetchall()
    except Exception:
        return

    def _row_id(r):
        try:
            return int(r['id'])
        except Exception:
            try:
                return int(r[0])
            except Exception:
                return None

    breakfast_ids = [i for i in (_row_id(r) for r in breakfast_rows) if i]
    lunch_ids = [i for i in (_row_id(r) for r in lunch_rows) if i]

    if not breakfast_ids or not lunch_ids:
        return

    try:
        per_day_int = int(per_day or 1)
    except Exception:
        per_day_int = 1

    per_day_b = max(1, min(per_day_int, len(breakfast_ids)))
    per_day_l = max(1, min(per_day_int, len(lunch_ids)))

    for d in _iter_dates(start_date, end_date):
        ds = d.strftime('%Y-%m-%d')

        start_b = d.toordinal() % len(breakfast_ids)
        start_l = d.toordinal() % len(lunch_ids)

        for k in range(per_day_b):
            bi = breakfast_ids[(start_b + k) % len(breakfast_ids)]
            cursor.execute(
                "INSERT OR IGNORE INTO menu_schedule (menu_date, meal_type, menu_item_id) VALUES (?, 'breakfast', ?)",
                (ds, bi)
            )

        for k in range(per_day_l):
            li = lunch_ids[(start_l + k) % len(lunch_ids)]
            cursor.execute(
                "INSERT OR IGNORE INTO menu_schedule (menu_date, meal_type, menu_item_id) VALUES (?, 'lunch', ?)",
                (ds, li)
            )


def seed_default_dish_ingredients(cursor):
    """Заполняет таблицу dish_ingredients для дефолтных блюд, если у блюда ещё не задана рецептура."""
    try:
        dishes = cursor.execute("SELECT id, name, category FROM menu_items").fetchall()
    except Exception:
        return

    for d in dishes:
        try:
            dish_id = int(d['id'])
            name = d['name']
            category = d['category']
        except Exception:
            try:
                dish_id = int(d[0])
                name = d[1]
                category = d[2]
            except Exception:
                continue

        try:
            exists = cursor.execute(
                "SELECT 1 FROM dish_ingredients WHERE dish_id = ? LIMIT 1",
                (dish_id,)
            ).fetchone()
        except Exception:
            return

        if exists:
            continue

        recipe = DEFAULT_DISH_RECIPES.get(name)
        if not recipe:
            recipe = list((MEAL_CONSUMPTION.get(category) or {}).items())

        if not recipe:
            continue

        for product_name, qty in recipe:
            try:
                qty_val = float(qty)
            except Exception:
                continue
            if qty_val <= 0:
                continue

            prod = cursor.execute(
                "SELECT id FROM products WHERE name = ? ORDER BY id ASC LIMIT 1",
                (product_name,)
            ).fetchone()
            if not prod:
                continue

            cursor.execute(
                "INSERT OR IGNORE INTO dish_ingredients (dish_id, product_id, quantity) VALUES (?, ?, ?)",
                (dish_id, int(prod['id']), qty_val)
            )


def init_db():

    db = get_db()
    cursor = db.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            full_name TEXT NOT NULL,
            date_of_birth TEXT,
            school TEXT DEFAULT '',
            class_name TEXT DEFAULT '',
            role TEXT NOT NULL CHECK(role IN ('student', 'cook', 'admin')),
            balance REAL DEFAULT 0,
            preferences TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')

    try:
        ensure_column(cursor, 'users', 'preferences', "TEXT DEFAULT ''")
    except Exception:
        pass

    try:
        ensure_column(cursor, 'users', 'date_of_birth', 'TEXT')
    except Exception:
        pass

    try:
        ensure_column(cursor, 'users', 'school', "TEXT DEFAULT ''")
    except Exception:
        pass

    try:
        ensure_column(cursor, 'users', 'class_name', "TEXT DEFAULT ''")
    except Exception:
        pass

    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_full_name ON users(full_name)")
    except Exception:
        pass

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            audience TEXT NOT NULL CHECK(audience IN ('student', 'cook', 'admin', 'staff', 'all')),
            recipient_id INTEGER,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (recipient_id) REFERENCES users(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notification_reads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            notification_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(notification_id, user_id),
            FOREIGN KEY (notification_id) REFERENCES notifications(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id)")
    except Exception:
        pass

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS allergies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            allergen TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL CHECK(category IN ('breakfast', 'lunch')),
            price REAL NOT NULL,
            description TEXT,
            allergens TEXT,
            available BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')


    cursor.execute('''
        CREATE TABLE IF NOT EXISTS menu_schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            menu_date TEXT NOT NULL,
            meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch')),
            menu_item_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(menu_date, meal_type, menu_item_id),
            FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
        )
    ''')

    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_menu_schedule_date ON menu_schedule(menu_date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_menu_schedule_meal ON menu_schedule(meal_type)")
    except Exception:
        pass

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            payment_type TEXT NOT NULL CHECK(payment_type IN ('single', 'subscription')),
            meal_type TEXT CHECK(meal_type IN ('breakfast', 'lunch', 'both')),
            days_remaining INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            card_id TEXT,
            card_last4 TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    try:
        ensure_column(cursor, 'payments', 'card_id', 'TEXT')
    except Exception:
        pass
    try:
        ensure_column(cursor, 'payments', 'card_last4', 'TEXT')
    except Exception:
        pass

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS meal_claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch')),
            issued_by INTEGER,
            menu_item_id INTEGER,
            claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (issued_by) REFERENCES users(id),
            FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
        )
    ''')
    try:
        ensure_column(cursor, 'meal_claims', 'issued_by', 'INTEGER')
    except Exception:
        pass

    try:
        ensure_column(cursor, 'meal_claims', 'menu_item_id', 'INTEGER')
    except Exception:
        pass

    try:
        ensure_column(cursor, 'meal_claims', 'student_received', 'INTEGER')
    except Exception:
        pass

    try:
        ensure_column(cursor, 'meal_claims', 'student_marked_at', 'TIMESTAMP')
    except Exception:
        pass

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            menu_item_id INTEGER NOT NULL,
            rating INTEGER CHECK(rating >= 1 AND rating <= 5),
            comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            quantity REAL NOT NULL,
            unit TEXT NOT NULL,
            min_quantity REAL NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')


    cursor.execute('''
        CREATE TABLE IF NOT EXISTS dish_ingredients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dish_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(dish_id, product_id),
            FOREIGN KEY (dish_id) REFERENCES menu_items(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    ''')
    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_dish_ingredients_dish_id ON dish_ingredients(dish_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_dish_ingredients_product_id ON dish_ingredients(product_id)")
    except Exception:
        pass

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS purchase_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER,
            product_name TEXT NOT NULL,
            quantity REAL NOT NULL,
            unit TEXT NOT NULL,
            estimated_cost REAL DEFAULT 0,
            reason TEXT,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
            requested_by INTEGER NOT NULL,
            reviewed_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reviewed_at TIMESTAMP,
            FOREIGN KEY (requested_by) REFERENCES users(id),
            FOREIGN KEY (reviewed_by) REFERENCES users(id)
        )
    ''')
    try:
        ensure_column(cursor, 'purchase_requests', 'product_id', 'INTEGER')
    except Exception:
        pass

    try:
        ensure_column(cursor, 'purchase_requests', 'estimated_cost', 'REAL DEFAULT 0')
    except Exception:
        pass

    try:
        dedupe_products(cursor)
        dedupe_menu_items(cursor)
        dedupe_allergies(cursor)
        ensure_unique_indexes(cursor)
    except Exception:
        pass

    cursor.execute(
        "INSERT OR IGNORE INTO users (username, password, full_name, role, balance) VALUES (?, ?, ?, ?, ?)",
        ('student1', generate_password_hash('password123'), 'Студент', 'student', 500)
    )
    cursor.execute(
        "INSERT OR IGNORE INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)",
        ('cook1', generate_password_hash('password123'), 'Повар', 'cook')
    )
    cursor.execute(
        "INSERT OR IGNORE INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)",
        ('admin1', generate_password_hash('password123'), 'Администратор', 'admin')
    )

    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Овсяная каша', 'breakfast', 80, 'С медом и орехами', 'орехи, глютен')
    )
    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Омлет', 'breakfast', 90, 'С помидорами и сыром', 'яйца, молоко')
    )
    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Борщ', 'lunch', 120, 'Со сметаной', 'молоко')
    )
    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Котлета с пюре', 'lunch', 150, 'Куриная котлета с картофельным пюре', 'глютен')
    )

    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Сырники', 'breakfast', 110, 'Со сметаной', 'молоко, яйца, глютен')
    )
    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Блинчики с творогом', 'breakfast', 100, 'Подаются со сгущёнкой', 'молоко, яйца, глютен')
    )
    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Гречневая каша', 'breakfast', 75, 'Сливочное масло', 'молоко')
    )
    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Рисовая каша', 'breakfast', 80, 'На молоке', 'молоко')
    )
    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Йогурт с мюсли', 'breakfast', 95, 'Натуральный йогурт, мюсли', 'молоко, глютен')
    )
    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Фруктовый салат', 'breakfast', 85, 'Яблоко, банан, апельсин', '')
    )
    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Сэндвич с курицей', 'breakfast', 130, 'Тостовый хлеб, курица, салат', 'глютен')
    )

    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Суп куриный', 'lunch', 110, 'С лапшой', 'глютен')
    )
    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Суп-пюре овощной', 'lunch', 115, 'Нежный суп-пюре', '')
    )
    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Салат овощной', 'lunch', 70, 'Свежие овощи и зелень', '')
    )
    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Плов с курицей', 'lunch', 160, 'Рис, курица, овощи', '')
    )
    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Рыба с рисом', 'lunch', 170, 'Филе рыбы, рис', 'рыба')
    )
    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Паста болоньезе', 'lunch', 180, 'Паста с мясным соусом', 'глютен')
    )
    cursor.execute(
        "INSERT OR IGNORE INTO menu_items (name, category, price, description, allergens) VALUES (?, ?, ?, ?, ?)",
        ('Тефтели с гречкой', 'lunch', 155, 'Тефтели в соусе, гречка', 'глютен')
    )
    
    default_products = [
        ('Мука', 50, 'кг', 20),
        ('Молоко', 30, 'л', 15),
        ('Яйца', 100, 'шт', 50),

        # Завтраки
        ('Овсяные хлопья', 25, 'кг', 5),
        ('Мёд', 10, 'кг', 2),
        ('Орехи', 15, 'кг', 3),
        ('Сахар', 50, 'кг', 15),
        ('Соль', 20, 'кг', 5),
        ('Сливочное масло', 15, 'кг', 5),
        ('Творог', 25, 'кг', 8),
        ('Сгущённое молоко', 20, 'л', 5),
        ('Йогурт натуральный', 30, 'л', 10),
        ('Мюсли', 20, 'кг', 6),
        ('Яблоки', 30, 'кг', 10),
        ('Бананы', 25, 'кг', 8),
        ('Апельсины', 25, 'кг', 8),
        ('Тостовый хлеб', 60, 'шт', 20),

        ('Помидоры', 30, 'кг', 10),
        ('Огурцы', 30, 'кг', 10),
        ('Зелень', 5, 'кг', 1),
        ('Сыр', 20, 'кг', 5),
        ('Сметана', 15, 'кг', 5),
        ('Растительное масло', 20, 'л', 5),

        ('Свёкла', 40, 'кг', 10),
        ('Капуста', 50, 'кг', 15),
        ('Картофель', 120, 'кг', 40),
        ('Морковь', 40, 'кг', 10),
        ('Лук', 40, 'кг', 10),
        ('Чеснок', 5, 'кг', 1),

        ('Куриное филе', 50, 'кг', 15),
        ('Говядина', 35, 'кг', 10),
        ('Фарш мясной', 30, 'кг', 10),

        ('Рис', 60, 'кг', 20),
        ('Гречка', 50, 'кг', 20),
        ('Макароны', 50, 'кг', 15),
        ('Лапша', 20, 'кг', 5),
        ('Рыбное филе', 25, 'кг', 8),
        ('Томатная паста', 10, 'кг', 2),
    ]

    for p in default_products:
        cursor.execute(
            "INSERT OR IGNORE INTO products (name, quantity, unit, min_quantity) VALUES (?, ?, ?, ?)",
            p
        )

    try:
        b_price = get_subscription_day_price(cursor, 'breakfast')
        l_price = get_subscription_day_price(cursor, 'lunch')
        both_price = get_subscription_day_price(cursor, 'both')

        cursor.execute(
            "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('subscription_price_breakfast', ?)",
            (str(b_price),)
        )
        cursor.execute(
            "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('subscription_price_lunch', ?)",
            (str(l_price),)
        )
        cursor.execute(
            "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('subscription_price_both', ?)",
            (str(both_price),)
        )
    except Exception:
        pass


    try:
        seed_default_dish_ingredients(cursor)
    except Exception:
        pass

    
    try:
        today = datetime.now().date()
        start_date = today - timedelta(days=today.weekday())
        end_date = start_date + timedelta(days=90)
        seed_default_menu_schedule(cursor, start_date, end_date, per_day=3)
    except Exception:
        pass

    db.commit()
    db.close()

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Требуется авторизация'}), 401
        return f(*args, **kwargs)
    return decorated_function

def role_required(role):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'role' not in session or session['role'] != role:
                return jsonify({'error': 'Недостаточно прав доступа'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

@app.route('/')
def root():
    if 'user_id' in session:
        return redirect(url_for('main_page'))
    return redirect(url_for('login_page'))

@app.route('/login')
def login_page():
    if 'user_id' in session:
        return redirect(url_for('main_page'))
    return render_template('login.html')

@app.route('/main')
def main_page():
    if 'user_id' not in session:
        return redirect(url_for('login_page'))
    return render_template('main.html')

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    full_name = (data.get('full_name') or '').strip()

    date_of_birth_raw = (data.get('date_of_birth') or '').strip()
    school = (data.get('school') or '').strip()
    class_name_raw = (data.get('class_name') or '').strip()
    class_name = normalize_class_name(class_name_raw)

    if not username or not password or not full_name or not date_of_birth_raw or not school or not class_name_raw:
        return jsonify({'error': 'Заполните все поля'}), 400

    dob = parse_iso_date(date_of_birth_raw)
    if not dob:
        return jsonify({'error': 'Некорректная дата рождения'}), 400
    if dob > datetime.now().date():
        return jsonify({'error': 'Дата рождения не может быть в будущем'}), 400

    if not class_name:
        return jsonify({'error': 'Класс должен быть в формате, например: 7А'}), 400

    role = 'student'

    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO users (username, password, full_name, date_of_birth, school, class_name, role)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (username, generate_password_hash(password), full_name, dob.isoformat(), school, class_name, role)
        )
        db.commit()
        return jsonify({'message': 'Регистрация успешна'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Пользователь уже существует'}), 400
    finally:
        db.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    db = get_db()
    cursor = db.cursor()
    user = cursor.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    db.close()

    if user and check_password_hash(user['password'], password):
        session['user_id'] = user['id']
        session['username'] = user['username']
        session['full_name'] = user['full_name']
        session['role'] = user['role']
        return jsonify({
            'message': 'Вход выполнен',
            'role': user['role'],
            'full_name': user['full_name']
        }), 200

    return jsonify({'error': 'Неверные данные'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Выход выполнен'}), 200

@app.route('/api/me')
@login_required
def me():
    return jsonify({
        'user_id': session.get('user_id'),
        'username': session.get('username'),
        'full_name': session.get('full_name'),
        'role': session.get('role')
    })


def _allowed_notification_audiences_for_role(role: str):
    audiences = ['all', role]

    if role in ('cook', 'admin'):
        audiences.append('staff')
    return audiences


def _add_notification(cursor, title: str, message: str, audience: str = 'all', recipient_id=None, created_by=None):
    audience = (audience or 'all').strip()
    if audience not in ('student', 'cook', 'admin', 'staff', 'all'):
        audience = 'all'
    cursor.execute(
        """
        INSERT INTO notifications (title, message, audience, recipient_id, created_by)
        VALUES (?, ?, ?, ?, ?)
        """,
        (title, message, audience, recipient_id, created_by)
    )


@app.route('/api/notifications')
@login_required
def get_notifications():
    limit = request.args.get('limit', 50)
    try:
        limit = int(limit)
    except Exception:
        limit = 50
    limit = max(1, min(limit, 200))

    role = session.get('role') or ''
    audiences = _allowed_notification_audiences_for_role(role)
    placeholders = ','.join(['?'] * len(audiences))

    db = get_db()
    cursor = db.cursor()
    rows = cursor.execute(
        f"""
        SELECT
            n.id,
            n.title,
            n.message,
            n.audience,
            n.recipient_id,
            n.created_by,
            n.created_at,
            COALESCE(nr.id, 0) as _read_id
        FROM notifications n
        LEFT JOIN notification_reads nr
          ON nr.notification_id = n.id AND nr.user_id = ?
        WHERE (
            n.recipient_id = ?
            OR (n.recipient_id IS NULL AND n.audience IN ({placeholders}))
        )
        ORDER BY datetime(n.created_at) DESC, n.id DESC
        LIMIT ?
        """,
        (session['user_id'], session['user_id'], *audiences, limit)
    ).fetchall()
    db.close()

    result = []
    for r in rows:
        d = dict(r)
        d['is_read'] = bool(d.pop('_read_id'))
        result.append(d)
    return jsonify(result)


@app.route('/api/notifications/unread_count')
@login_required
def get_unread_notifications_count():
    role = session.get('role') or ''
    audiences = _allowed_notification_audiences_for_role(role)
    placeholders = ','.join(['?'] * len(audiences))

    db = get_db()
    cursor = db.cursor()
    cnt = cursor.execute(
        f"""
        SELECT COALESCE(COUNT(*), 0) as cnt
        FROM notifications n
        LEFT JOIN notification_reads nr
          ON nr.notification_id = n.id AND nr.user_id = ?
        WHERE (
            (n.recipient_id = ? OR (n.recipient_id IS NULL AND n.audience IN ({placeholders})))
            AND nr.id IS NULL
        )
        """,
        (session['user_id'], session['user_id'], *audiences)
    ).fetchone()
    db.close()
    return jsonify({'count': int(cnt['cnt'] if cnt else 0)})


@app.route('/api/notifications', methods=['POST'])
@login_required
@role_required('admin')
def create_notification():
    data = request.json or {}
    title = (data.get('title') or '').strip()
    message = (data.get('message') or '').strip()
    audience = (data.get('audience') or 'all').strip()

    if not title or not message:
        return jsonify({'error': 'Заполните заголовок и текст'}), 400

    if audience not in ('student', 'cook', 'admin', 'staff', 'all'):
        return jsonify({'error': 'Некорректная аудитория'}), 400

    db = get_db()
    cursor = db.cursor()
    _add_notification(cursor, title=title, message=message, audience=audience, recipient_id=None, created_by=session['user_id'])
    db.commit()
    db.close()
    return jsonify({'message': 'Уведомление создано'}), 201


@app.route('/api/notifications/<int:notification_id>/read', methods=['POST'])
@login_required
def mark_notification_read(notification_id):
    role = session.get('role') or ''
    audiences = _allowed_notification_audiences_for_role(role)
    placeholders = ','.join(['?'] * len(audiences))

    db = get_db()
    cursor = db.cursor()

    row = cursor.execute(
        f"""
        SELECT id
        FROM notifications
        WHERE id = ? AND (
            recipient_id = ? OR (recipient_id IS NULL AND audience IN ({placeholders}))
        )
        """,
        (notification_id, session['user_id'], *audiences)
    ).fetchone()

    if not row:
        db.close()
        return jsonify({'error': 'Уведомление не найдено'}), 404

    cursor.execute(
        "INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)",
        (notification_id, session['user_id'])
    )
    cursor.execute(
        "UPDATE notification_reads SET read_at = CURRENT_TIMESTAMP WHERE notification_id = ? AND user_id = ?",
        (notification_id, session['user_id'])
    )
    db.commit()
    db.close()

    return jsonify({'message': 'Отмечено как прочитанное'}), 200

@app.route('/api/menu')
@login_required
def get_menu():
    category = request.args.get('category', 'breakfast')
    if category not in ('breakfast', 'lunch'):
        return jsonify({'error': 'Некорректная категория'}), 400

    menu_date = request.args.get('date')
    if menu_date:
        d = parse_iso_date(menu_date)
        if not d:
            return jsonify({'error': 'Некорректная дата'}), 400
        menu_date = d.strftime('%Y-%m-%d')

    db = get_db()
    cursor = db.cursor()

    if menu_date:
        items = cursor.execute(
            '''
            SELECT m.*
            FROM menu_schedule s
            JOIN menu_items m ON m.id = s.menu_item_id
            WHERE s.menu_date = ?
              AND s.meal_type = ?
              AND m.available = 1
            ORDER BY m.name
            ''',
            (menu_date, category)
        ).fetchall()
    else:
        items = cursor.execute(
            "SELECT * FROM menu_items WHERE category = ? AND available = 1",
            (category,)
        ).fetchall()

    db.close()
    return jsonify([dict(item) for item in items])


@app.route('/api/menu_calendar')
@login_required
def get_menu_calendar():
    view = request.args.get('view', 'week')
    ref_str = request.args.get('date')
    ref_date = parse_iso_date(ref_str) or datetime.now().date()

    if view not in ('week', 'month'):
        return jsonify({'error': 'Некорректный вид'}), 400

    if view == 'week':
        start_date = ref_date - timedelta(days=ref_date.weekday())
        end_date = start_date + timedelta(days=6)
    else:
        first_day = ref_date.replace(day=1)
        if first_day.month == 12:
            next_month = first_day.replace(year=first_day.year + 1, month=1, day=1)
        else:
            next_month = first_day.replace(month=first_day.month + 1, day=1)
        last_day = next_month - timedelta(days=1)

        start_date = first_day - timedelta(days=first_day.weekday())
        end_date = last_day + timedelta(days=(6 - last_day.weekday()))

    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')

    db = get_db()
    cursor = db.cursor()

    try:
        c_row = cursor.execute("SELECT COUNT(1) AS c FROM menu_schedule").fetchone()
        c = int(c_row['c']) if c_row else 0
    except Exception:
        c = 0

    if c == 0:
        try:
            seed_default_menu_schedule(cursor, start_date, end_date + timedelta(days=60))
            db.commit()
        except Exception:
            pass

    rows = cursor.execute(
        '''
        SELECT s.menu_date, s.meal_type,
               m.id AS id, m.name, m.category, m.price, m.description, m.allergens
        FROM menu_schedule s
        JOIN menu_items m ON m.id = s.menu_item_id
        WHERE s.menu_date BETWEEN ? AND ?
          AND s.meal_type IN ('breakfast', 'lunch')
          AND m.available = 1
        ORDER BY s.menu_date ASC, s.meal_type ASC, m.name ASC
        ''',
        (start_str, end_str)
    ).fetchall()

    by = {}
    for r in rows:
        key = (r['menu_date'], r['meal_type'])
        by.setdefault(key, []).append({
            'id': r['id'],
            'name': r['name'],
            'category': r['category'],
            'price': r['price'],
            'description': r['description'],
            'allergens': r['allergens']
        })

    days = []
    d = start_date
    while d <= end_date:
        ds = d.strftime('%Y-%m-%d')
        days.append({
            'date': ds,
            'breakfast': by.get((ds, 'breakfast'), []),
            'lunch': by.get((ds, 'lunch'), [])
        })
        d += timedelta(days=1)

    db.close()
    return jsonify({
        'view': view,
        'reference_date': ref_date.strftime('%Y-%m-%d'),
        'start': start_str,
        'end': end_str,
        'days': days
    })

@app.route('/api/balance')
@login_required
def get_balance():
    db = get_db()
    cursor = db.cursor()
    user = cursor.execute("SELECT balance FROM users WHERE id = ?", (session['user_id'],)).fetchone()
    db.close()
    return jsonify({'balance': user['balance'] if user else 0})

@app.route('/api/subscriptions')
@login_required
@role_required('student')
def get_subscriptions():
    db = get_db()
    cursor = db.cursor()
    subs = cursor.execute(
        """
        SELECT id, meal_type, days_remaining, created_at
        FROM payments
        WHERE user_id = ?
          AND payment_type = 'subscription'
          AND status = 'active'
          AND days_remaining > 0
        ORDER BY created_at DESC
        """,
        (session['user_id'],)
    ).fetchall()
    db.close()
    return jsonify([dict(s) for s in subs])


@app.route('/api/pricing')
@login_required
def get_pricing():
    """Текущие тарифы (используются для автоподсчета стоимости абонемента)."""
    db = get_db()
    cursor = db.cursor()
    try:
        prices = {
            'breakfast': get_subscription_day_price(cursor, 'breakfast'),
            'lunch': get_subscription_day_price(cursor, 'lunch'),
            'both': get_subscription_day_price(cursor, 'both')
        }
    finally:
        db.close()

    return jsonify({'subscription': prices})


@app.route('/api/pricing', methods=['POST'])
@login_required
@role_required('admin')
def update_pricing():
    """Обновляет тарифы (₽/день) для абонементов. Только админ."""
    data = request.json or {}

    def _read(name):
        if name not in data:
            return None
        try:
            v = float(data.get(name))
        except Exception:
            raise ValueError('Некорректное значение')
        if v < 0:
            raise ValueError('Стоимость не может быть отрицательной')
        return v

    try:
        b = _read('breakfast')
        l = _read('lunch')
        both = _read('both')
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    if b is None and l is None and both is None:
        return jsonify({'error': 'Нечего обновлять'}), 400

    db = get_db()
    cursor = db.cursor()
    try:
        if b is not None:
            set_app_setting(cursor, 'subscription_price_breakfast', b)
        if l is not None:
            set_app_setting(cursor, 'subscription_price_lunch', l)
        if both is not None:
            set_app_setting(cursor, 'subscription_price_both', both)
        db.commit()
    finally:
        db.close()

    return jsonify({'message': 'Тарифы обновлены'})

@app.route('/api/payment', methods=['POST'])
@login_required
@role_required('student')
def make_payment():
    data = request.json or {}

    forbidden_keys = {
        'card_number', 'cardNumber', 'pan',
        'cvv', 'cvc', 'card_cvv', 'cardCvv',
        'expiry', 'exp', 'card_expiry', 'cardExpiry',
        'holder', 'card_holder', 'cardHolder'
    }
    for k in forbidden_keys:
        if k in data and data.get(k):
            return jsonify({'error': 'Нельзя передавать данные карты на сервер. Используйте только token (card_id).'}), 400
    payment_type = data.get('payment_type')
    meal_type = data.get('meal_type')

    if payment_type not in ('single', 'subscription'):
        return jsonify({'error': 'Некорректный тип оплаты'}), 400

    if meal_type not in ('breakfast', 'lunch', 'both'):
        return jsonify({'error': 'Некорректный тип питания'}), 400

    days = 0
    amount = 0.0

    db = get_db()
    cursor = db.cursor()

    card_id = data.get('card_id')
    card_last4 = data.get('card_last4')

    if card_id is not None:
        card_id = str(card_id).strip()
        if card_id == '':
            card_id = None
        elif len(card_id) > 128:
            card_id = card_id[:128]
    else:
        card_id = None

    if card_last4 is not None:
        digits = re.sub(r'\D', '', str(card_last4))
        card_last4 = digits[-4:] if len(digits) >= 4 else None
    else:
        card_last4 = None


    try:
        ensure_column(cursor, 'payments', 'card_id', 'TEXT')
        ensure_column(cursor, 'payments', 'card_last4', 'TEXT')
    except Exception:
        pass


    if payment_type == 'single':
        raw_amount = data.get('amount')
        try:
            amount = float(raw_amount)
        except Exception:
            db.close()
            return jsonify({'error': 'Некорректная сумма'}), 400

        if amount <= 0:
            db.close()
            return jsonify({'error': 'Сумма должна быть больше 0'}), 400

        cursor.execute("UPDATE users SET balance = balance + ? WHERE id = ?", (amount, session['user_id']))

    
    if payment_type == 'subscription':
        try:
            days = int(data.get('days', 20))
        except Exception:
            db.close()
            return jsonify({'error': 'Некорректное количество дней'}), 400
        if days <= 0:
            db.close()
            return jsonify({'error': 'Количество дней должно быть больше 0'}), 400

        day_price = get_subscription_day_price(cursor, meal_type)
        amount = round(float(day_price or 0) * float(days), 2)

        if amount <= 0:
            db.close()
            return jsonify({'error': 'Стоимость абонемента не задана администратором'}), 400

        user_row = cursor.execute(
            "SELECT balance FROM users WHERE id = ?",
            (session['user_id'],)
        ).fetchone()

        current_balance = float(user_row['balance'] if user_row else 0)

        if current_balance < amount:
            db.close()
            return jsonify({
                'error': f'Недостаточно средств: требуется {amount} ₽, на балансе {current_balance} ₽'
            }), 400

        cursor.execute(
            "UPDATE users SET balance = balance - ? WHERE id = ?",
            (amount, session['user_id'])
        )

    cursor.execute(
        """
        INSERT INTO payments (user_id, amount, payment_type, meal_type, days_remaining, card_id, card_last4)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (session['user_id'], amount, payment_type, meal_type, days, card_id, card_last4)
    )


    try:
        pt_label = 'Разовая оплата' if payment_type == 'single' else 'Абонемент'
        mt_label = {'breakfast': 'Завтрак', 'lunch': 'Обед', 'both': 'Завтрак + Обед'}.get(meal_type, meal_type)
        extra = ''
        if payment_type == 'subscription':
            extra = f" (дней: {days})"
        sign = '+' if payment_type == 'single' else '−'
        card_info = f" (карта •••• {card_last4})" if card_last4 else ''
        _add_notification(
            cursor,
            title='Оплата питания',
            message=f"{pt_label}: {sign}{amount} ₽, питание: {mt_label}{extra}{card_info}.",
            audience='student',
            recipient_id=session['user_id'],
            created_by=session['user_id']
        )
    except Exception:
        pass

    
    new_balance = None
    try:
        row = cursor.execute("SELECT balance FROM users WHERE id = ?", (session['user_id'],)).fetchone()
        if row:
            new_balance = float(row['balance'] if isinstance(row, sqlite3.Row) else row[0])
    except Exception:
        new_balance = None

    db.commit()
    db.close()

    payload = {
        'message': 'Оплата успешна',
        'payment_type': payment_type,
        'amount': amount,
    }
    if new_balance is not None:
        payload['balance'] = new_balance

    return jsonify(payload), 200

def _meal_price(cursor, meal_type):
    row = cursor.execute(
        "SELECT MIN(price) as price FROM menu_items WHERE category = ? AND available = 1",
        (meal_type,)
    ).fetchone()
    if not row:
        return 0
    val = row['price'] if isinstance(row, sqlite3.Row) else row[0]
    return float(val or 0)

def process_meal_claim(user_id, meal_type, issuer_id, menu_item_id=None):
    if meal_type not in ('breakfast', 'lunch'):
        return False, 'Некорректный тип питания'

    db = get_db()
    cursor = db.cursor()

    try:
        today = datetime.now().date()
        existing = cursor.execute(
            "SELECT 1 FROM meal_claims WHERE user_id = ? AND meal_type = ? AND DATE(claimed_at) = ?",
            (user_id, meal_type, today)
        ).fetchone()
        if existing:
            return False, 'Это питание уже получено.'
        any_claim_today = cursor.execute(
            "SELECT 1 FROM meal_claims WHERE user_id = ? AND DATE(claimed_at) = ? LIMIT 1",
            (user_id, today)
        ).fetchone()
        selected_menu_item_id = None
        selected_price = None
        if menu_item_id not in (None, '', 0):
            try:
                selected_menu_item_id = int(menu_item_id)
            except Exception:
                return False, 'Некорректное блюдо'

            item = cursor.execute(
                "SELECT id, category, price FROM menu_items WHERE id = ? AND available = 1",
                (selected_menu_item_id,)
            ).fetchone()

            if not item:
                return False, 'Блюдо не найдено'

            if item['category'] != meal_type:
                return False, 'Выбранное блюдо не относится к выбранному типу питания'

            selected_price = float(item['price'] or 0)
        sub = cursor.execute(
            """
            SELECT * FROM payments
            WHERE user_id = ?
              AND payment_type = 'subscription'
              AND status = 'active'
              AND days_remaining > 0
              AND (meal_type = ? OR meal_type = 'both')
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (user_id, meal_type)
        ).fetchone()

        if sub:
            should_decrement = True
            if sub['meal_type'] == 'both' and any_claim_today:
                should_decrement = False

            if should_decrement:
                new_days = int(sub['days_remaining']) - 1
                new_status = 'active' if new_days > 0 else 'expired'
                cursor.execute(
                    "UPDATE payments SET days_remaining = ?, status = ? WHERE id = ?",
                    (new_days, new_status, sub['id'])
                )
        else:
            price = selected_price if selected_price is not None else _meal_price(cursor, meal_type)
            user = cursor.execute("SELECT balance FROM users WHERE id = ?", (user_id,)).fetchone()
            balance = float(user['balance'] if user else 0)

            if balance < price:
                return False, f'Недостаточно средств: требуется {price} ₽, на балансе {balance} ₽'

            cursor.execute("UPDATE users SET balance = balance - ? WHERE id = ?", (price, user_id))

        
        required = []
        if selected_menu_item_id:
            try:
                required = [
                    dict(r)
                    for r in cursor.execute(
                        """
                        SELECT di.product_id AS product_id,
                               di.quantity AS need,
                               p.name AS product_name,
                               p.unit AS unit,
                               p.quantity AS available
                        FROM dish_ingredients di
                        JOIN products p ON p.id = di.product_id
                        WHERE di.dish_id = ?
                        ORDER BY p.name
                        """,
                        (selected_menu_item_id,)
                    ).fetchall()
                ]
            except Exception:
                required = []

        
        if not required:
            required = []
            for product_name, need in (MEAL_CONSUMPTION.get(meal_type) or {}).items():
                row = cursor.execute(
                    "SELECT id AS product_id, name AS product_name, unit AS unit, quantity AS available FROM products WHERE name = ? ORDER BY id ASC LIMIT 1",
                    (product_name,)
                ).fetchone()
                if not row:
                    continue
                d = dict(row)
                d['need'] = float(need)
                required.append(d)

        missing = []
        for r in required:
            need = float(r.get('need') or 0)
            avail = float(r.get('available') or 0)
            unit = (r.get('unit') or '').strip()
            pname = (r.get('product_name') or '').strip()
            if avail < need:
                if unit:
                    missing.append(f"{pname} (есть {avail} {unit}, нужно {need} {unit})")
                else:
                    missing.append(f"{pname} (нужно {need})")

        if missing:
            return False, 'Недостаточно продуктов: ' + ', '.join(missing)

        for r in required:
            try:
                pid = int(r.get('product_id'))
                need = float(r.get('need') or 0)
            except Exception:
                continue
            if need <= 0:
                continue
            cursor.execute(
                "UPDATE products SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (need, pid)
            )

        try:
            ensure_column(cursor, 'meal_claims', 'issued_by', 'INTEGER')
        except Exception:
            pass
        try:
            ensure_column(cursor, 'meal_claims', 'menu_item_id', 'INTEGER')
        except Exception:
            pass
        
        student_received = None
        student_marked_at = None
        try:
            if issuer_id is not None and int(issuer_id) == int(user_id):
                student_received = 1
        except Exception:
            student_received = None

        if student_received is not None:
            try:
                student_marked_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            except Exception:
                student_marked_at = None

        try:
            ensure_column(cursor, 'meal_claims', 'student_received', 'INTEGER')
            ensure_column(cursor, 'meal_claims', 'student_marked_at', 'TIMESTAMP')
        except Exception:
            pass

        cursor.execute(
            "INSERT INTO meal_claims (user_id, meal_type, issued_by, menu_item_id, student_received, student_marked_at) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, meal_type, issuer_id, selected_menu_item_id, student_received, student_marked_at)
        )

        
        try:
            meal_label = 'Завтрак' if meal_type == 'breakfast' else 'Обед'
            issuer_name = None
            if issuer_id and int(issuer_id) != int(user_id):
                issuer_row = cursor.execute(
                    "SELECT full_name FROM users WHERE id = ?",
                    (issuer_id,)
                ).fetchone()
                issuer_name = issuer_row['full_name'] if issuer_row else None

            dish_name = None
            if selected_menu_item_id:
                dish_row = cursor.execute(
                    "SELECT name FROM menu_items WHERE id = ?",
                    (selected_menu_item_id,)
                ).fetchone()
                dish_name = dish_row['name'] if dish_row else None

            parts = [f"Отмечено питание: {meal_label}."]
            if dish_name:
                parts.append(f"Блюдо: {dish_name}.")
            if issuer_name:
                parts.append(f"Выдал сотрудник: {issuer_name}.")
            _add_notification(
                cursor,
                title='Питание',
                message=' '.join(parts),
                audience='student',
                recipient_id=user_id,
                created_by=issuer_id
            )
        except Exception:
            pass

        db.commit()
        return True, 'Питание отмечено'
    except sqlite3.IntegrityError:
        db.rollback()
        return False, 'Ошибка данных'
    finally:
        db.close()

@app.route('/api/claim_meal', methods=['POST'])
@login_required
@role_required('student')
def claim_meal():
    """Самостоятельная выдача питания учеником отключена.

    Питание выдаёт повар (через раздел «Выдача»). Ученик после этого отмечает,
    получил он питание или нет.
    """
    return jsonify({
        'error': 'Питание выдаёт повар. После выдачи откройте раздел «Получить питание» и подтвердите: получили вы питание или нет.'
    }), 403


@app.route('/api/allergies', methods=['GET', 'POST'])
@login_required
@role_required('student')
def manage_allergies():
    db = get_db()
    cursor = db.cursor()

    if request.method == 'POST':
        data = request.json or {}
        if isinstance(data.get('allergens'), list):
            raw_list = data.get('allergens') or []
            selected = [normalize_allergen(a) for a in raw_list]
            selected = [a for a in selected if a]

            invalid = [a for a in selected if a not in ALLOWED_ALLERGENS]
            if invalid:
                db.close()
                return jsonify({'error': f"Недопустимый аллерген: {', '.join(invalid)}"}), 400
            cursor.execute("DELETE FROM allergies WHERE user_id = ?", (session['user_id'],))
            for a in sorted(set(selected)):
                cursor.execute(
                    "INSERT OR IGNORE INTO allergies (user_id, allergen) VALUES (?, ?)",
                    (session['user_id'], a)
                )
            db.commit()
            db.close()
            return jsonify({'message': 'Аллергены сохранены'}), 200
        allergen = normalize_allergen(data.get('allergen'))
        if not allergen:
            db.close()
            return jsonify({'error': 'Выберите аллерген'}), 400

        if allergen not in ALLOWED_ALLERGENS:
            db.close()
            return jsonify({'error': 'Аллерген должен быть выбран из списка'}), 400

        cursor.execute(
            "INSERT OR IGNORE INTO allergies (user_id, allergen) VALUES (?, ?)",
            (session['user_id'], allergen)
        )
        db.commit()
        db.close()
        return jsonify({'message': 'Аллерген добавлен'}), 201

    allergies = cursor.execute(
        "SELECT * FROM allergies WHERE user_id = ? ORDER BY allergen ASC",
        (session['user_id'],)
    ).fetchall()
    db.close()

    return jsonify([dict(a) for a in allergies])

@app.route('/api/allergies/<int:allergy_id>', methods=['DELETE'])
@login_required
@role_required('student')
def delete_allergy(allergy_id):
    db = get_db()
    cursor = db.cursor()
    row = cursor.execute(
        "SELECT id FROM allergies WHERE id = ? AND user_id = ?",
        (allergy_id, session['user_id'])
    ).fetchone()
    if not row:
        db.close()
        return jsonify({'error': 'Аллерген не найден'}), 404

    cursor.execute("DELETE FROM allergies WHERE id = ?", (allergy_id,))
    db.commit()
    db.close()
    return jsonify({'message': 'Аллерген удалён'}), 200

@app.route('/api/preferences', methods=['GET', 'POST'])
@login_required
@role_required('student')
def preferences():
    db = get_db()
    cursor = db.cursor()

    if request.method == 'POST':
        data = request.json or {}
        prefs = (data.get('preferences') or '').strip()
        cursor.execute("UPDATE users SET preferences = ? WHERE id = ?", (prefs, session['user_id']))
        db.commit()
        db.close()
        return jsonify({'message': 'Сохранено'}), 200

    user = cursor.execute("SELECT preferences FROM users WHERE id = ?", (session['user_id'],)).fetchone()
    db.close()
    return jsonify({'preferences': user['preferences'] if user else ''})

@app.route('/api/reviews', methods=['GET', 'POST'])
@login_required
@role_required('student')
def manage_reviews():
    db = get_db()
    cursor = db.cursor()

    if request.method == 'POST':
        data = request.json or {}
        try:
            menu_item_id = int(data.get('menu_item_id'))
            rating = int(data.get('rating'))
        except Exception:
            db.close()
            return jsonify({'error': 'Некорректные данные'}), 400

        comment = data.get('comment')

        cursor.execute(
            "INSERT INTO reviews (user_id, menu_item_id, rating, comment) VALUES (?, ?, ?, ?)",
            (session['user_id'], menu_item_id, rating, comment)
        )
        db.commit()
        db.close()
        return jsonify({'message': 'Отзыв добавлен'}), 201

    reviews = cursor.execute(
        """
        SELECT r.*, u.full_name, m.name as dish_name
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        JOIN menu_items m ON r.menu_item_id = m.id
        ORDER BY r.created_at DESC
        """
    ).fetchall()
    db.close()

    return jsonify([dict(r) for r in reviews])

@app.route('/api/products')
@login_required
@role_required('cook')
def get_products():
    db = get_db()
    cursor = db.cursor()
    products = cursor.execute("SELECT * FROM products").fetchall()
    db.close()
    return jsonify([dict(p) for p in products])

@app.route('/api/meal_stats')
@login_required
@role_required('cook')
def meal_stats():
    db = get_db()
    cursor = db.cursor()

    today = datetime.now().date()
    stats = cursor.execute(
        "SELECT meal_type, COUNT(*) as count FROM meal_claims WHERE DATE(claimed_at) = ? GROUP BY meal_type",
        (today,)
    ).fetchall()

    db.close()
    return jsonify([dict(s) for s in stats])


@app.route('/api/cook/meal-history', methods=['GET'])
@login_required
def cook_meal_history():
    """История выдачи питания (для повара/админа)."""
    if session.get('role') not in ('cook', 'admin'):
        return jsonify({'error': 'Доступ запрещен'}), 403

    days = _safe_int(request.args.get('days'), 7)
    limit = _safe_int(request.args.get('limit'), 200)
    scope = (request.args.get('scope') or 'all').strip().lower()
    meal_type = (request.args.get('meal_type') or '').strip().lower()
    date_from = parse_iso_date(request.args.get('date_from'))
    date_to = parse_iso_date(request.args.get('date_to'))

    try:
        days = int(days or 7)
    except Exception:
        days = 7
    days = max(1, min(days, 365))

    try:
        limit = int(limit or 200)
    except Exception:
        limit = 200
    limit = max(1, min(limit, 1000))

    if meal_type not in ('', 'breakfast', 'lunch'):
        meal_type = ''

    if scope not in ('all', 'mine'):
        scope = 'all'

    db = get_db()
    cursor = db.cursor()

    try:
        try:
            ensure_column(cursor, 'meal_claims', 'student_received', 'INTEGER')
            ensure_column(cursor, 'meal_claims', 'student_marked_at', 'TIMESTAMP')
        except Exception:
            pass

        where = []
        params = []

        if date_from and date_to:
            if date_to < date_from:
                date_from, date_to = date_to, date_from
            where.append("DATE(mc.claimed_at) BETWEEN ? AND ?")
            params.extend([date_from.strftime('%Y-%m-%d'), date_to.strftime('%Y-%m-%d')])
        else:
            start_date = datetime.now().date() - timedelta(days=days - 1)
            where.append("DATE(mc.claimed_at) >= ?")
            params.append(start_date.strftime('%Y-%m-%d'))

        if meal_type in ('breakfast', 'lunch'):
            where.append("mc.meal_type = ?")
            params.append(meal_type)

        if scope == 'mine':
            where.append("mc.issued_by = ?")
            params.append(session.get('user_id'))

        where_sql = ('WHERE ' + ' AND '.join(where)) if where else ''

        rows = cursor.execute(
            f'''
            SELECT
                mc.id,
                mc.claimed_at,
                mc.meal_type,
                mc.user_id,
                su.full_name AS student_name,
                su.username AS student_username,
                su.school,
                su.class_name,
                mc.menu_item_id,
                mi.name AS dish_name,
                mc.issued_by,
                iu.full_name AS issuer_name,
                mc.student_received,
                mc.student_marked_at
            FROM meal_claims mc
            LEFT JOIN users su ON su.id = mc.user_id
            LEFT JOIN users iu ON iu.id = mc.issued_by
            LEFT JOIN menu_items mi ON mi.id = mc.menu_item_id
            {where_sql}
            ORDER BY datetime(mc.claimed_at) DESC, mc.id DESC
            LIMIT ?
            ''',
            tuple(params + [limit])
        ).fetchall()

        items = [dict(r) for r in rows]

        summary = {
            'total': len(items),
            'breakfast': sum(1 for i in items if i.get('meal_type') == 'breakfast'),
            'lunch': sum(1 for i in items if i.get('meal_type') == 'lunch'),
            'pending_confirmation': sum(1 for i in items if i.get('student_received') is None),
            'received_yes': sum(1 for i in items if i.get('student_received') == 1),
            'received_no': sum(1 for i in items if i.get('student_received') == 0),
        }

        return jsonify({'items': items, 'summary': summary}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/students/search')
@login_required
def search_students():
    """Поиск учеников по ФИО (для сотрудников)."""
    if session.get('role') not in ('cook', 'admin'):
        return jsonify({'error': 'Недостаточно прав доступа'}), 403

    query = (request.args.get('query') or request.args.get('q') or '').strip()
    if len(query) < 2:
        return jsonify([])

    
    variants = {
        query,
        query.title(),
        query.capitalize(),
        query.upper(),
        query.lower()
    }
    like_variants = [f"%{v}%" for v in variants if v]
    if not like_variants:
        return jsonify([])

    where = ' OR '.join(['full_name LIKE ?'] * len(like_variants))
    db = get_db()
    cursor = db.cursor()
    rows = cursor.execute(
        f"""
        SELECT id, full_name, username, school, class_name
        FROM users
        WHERE role = 'student'
          AND ({where})
        ORDER BY full_name ASC
        LIMIT 15
        """,
        tuple(like_variants)
    ).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/issue_meal', methods=['POST'])
@login_required
@role_required('cook')
def issue_meal():
    data = request.json or {}
    student_id_raw = data.get('student_id')
    full_name = (data.get('full_name') or '').strip()
    username = (data.get('username') or '').strip()
    meal_type = data.get('meal_type')
    menu_item_id = data.get('menu_item_id')

    if not student_id_raw and not full_name and not username:
        return jsonify({'error': 'Укажите ФИО ученика'}), 400

    db = get_db()
    cursor = db.cursor()

    student = None

    if student_id_raw not in (None, ''):
        try:
            student_id = int(student_id_raw)
        except Exception:
            db.close()
            return jsonify({'error': 'Некорректный ученик'}), 400

        student = cursor.execute(
            "SELECT id, role FROM users WHERE id = ?",
            (student_id,)
        ).fetchone()

    if not student and full_name:
        variants = {
            full_name,
            full_name.title(),
            full_name.capitalize(),
            full_name.upper(),
            full_name.lower()
        }
        variants = [v for v in variants if v]

        matches = []
        if variants:
            placeholders = ','.join(['?'] * len(variants))
            matches = cursor.execute(
                f"""
                SELECT id, username, full_name, school, class_name
                FROM users
                WHERE role = 'student' AND full_name IN ({placeholders})
                ORDER BY id ASC
                """,
                tuple(variants)
            ).fetchall()

        if not matches:
            like_variants = [f"%{v}%" for v in variants if v]
            if like_variants:
                where = ' OR '.join(['full_name LIKE ?'] * len(like_variants))
                matches = cursor.execute(
                    f"""
                    SELECT id, username, full_name, school, class_name
                    FROM users
                    WHERE role = 'student' AND ({where})
                    ORDER BY full_name ASC
                    LIMIT 25
                    """,
                    tuple(like_variants)
                ).fetchall()

        if len(matches) == 1:
            student = {'id': matches[0]['id'], 'role': 'student'}
        elif len(matches) > 1:
            db.close()
            return jsonify({
                'error': 'Найдено несколько учеников с таким ФИО — выберите нужного из списка',
                'matches': [dict(m) for m in matches]
            }), 409

    if not student and username:
        student = cursor.execute(
            "SELECT id, role FROM users WHERE username = ?",
            (username,)
        ).fetchone()

    db.close()

    if not student or student['role'] != 'student':
        return jsonify({'error': 'Ученик не найден'}), 404

    ok, msg = process_meal_claim(
        student['id'],
        meal_type,
        issuer_id=session['user_id'],
        menu_item_id=menu_item_id
    )
    if ok:
        return jsonify({'message': 'Питание выдано'}), 200
    return jsonify({'error': msg}), 400

@app.route('/api/purchase_request', methods=['POST'])
@login_required
@role_required('cook')
def create_purchase_request():
    data = request.json or {}

    reason = data.get('reason')
    try:
        quantity = float(data.get('quantity'))
    except Exception:
        return jsonify({'error': 'Некорректное количество'}), 400

    if quantity <= 0:
        return jsonify({'error': 'Количество должно быть больше 0'}), 400
    estimated_cost = 0
    if data.get('estimated_cost') not in (None, ''):
        try:
            estimated_cost = float(data.get('estimated_cost'))
        except Exception:
            return jsonify({'error': 'Некорректная стоимость'}), 400
        if estimated_cost < 0:
            return jsonify({'error': 'Стоимость не может быть отрицательной'}), 400

    db = get_db()
    cursor = db.cursor()

    try:
        product_id_raw = data.get('product_id')
        product_id = None
        product_name = (data.get('product_name') or '').strip()
        unit = (data.get('unit') or '').strip()

        if product_id_raw not in (None, ''):
            try:
                product_id = int(product_id_raw)
            except Exception:
                return jsonify({'error': 'Некорректный продукт'}), 400

            prod = cursor.execute(
                "SELECT id, name, unit FROM products WHERE id = ?",
                (product_id,)
            ).fetchone()

            if not prod:
                return jsonify({'error': 'Продукт не найден'}), 404

            product_id = prod['id']
            product_name = prod['name']
            unit = prod['unit']
        else:
            if not product_name or not unit:
                return jsonify({'error': 'Выберите продукт'}), 400

            prod = cursor.execute(
                "SELECT id, unit FROM products WHERE name = ? AND unit = ? LIMIT 1",
                (product_name, unit)
            ).fetchone()
            if prod:
                product_id = prod['id']

        cursor.execute(
            """
            INSERT INTO purchase_requests (product_id, product_name, quantity, unit, estimated_cost, reason, requested_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (product_id, product_name, quantity, unit, estimated_cost, reason, session['user_id'])
        )
        db.commit()
    finally:
        db.close()

    return jsonify({'message': 'Заявка создана'}), 201

@app.route('/api/purchase_requests')
@login_required
def get_purchase_requests():
    if session.get('role') not in ('cook', 'admin'):
        return jsonify({'error': 'Недостаточно прав доступа'}), 403

    db = get_db()
    cursor = db.cursor()

    if session['role'] == 'admin':
        requests = cursor.execute(
            """
            SELECT pr.*, u.full_name as requested_by_name
            FROM purchase_requests pr
            JOIN users u ON pr.requested_by = u.id
            ORDER BY pr.created_at DESC
            """
        ).fetchall()
    else:
        requests = cursor.execute(
            "SELECT * FROM purchase_requests WHERE requested_by = ? ORDER BY created_at DESC",
            (session['user_id'],)
        ).fetchall()

    db.close()
    return jsonify([dict(r) for r in requests])

@app.route('/api/purchase_request/<int:request_id>/review', methods=['POST'])
@login_required
@role_required('admin')
def review_purchase_request(request_id):
    data = request.json or {}
    status = data.get('status')
    if status not in ('approved', 'rejected'):
        return jsonify({'error': 'Некорректный статус'}), 400

    db = get_db()
    cursor = db.cursor()

    try:
        req = cursor.execute(
            "SELECT * FROM purchase_requests WHERE id = ?",
            (request_id,)
        ).fetchone()

        if not req:
            return jsonify({'error': 'Заявка не найдена'}), 404

        if req['status'] != 'pending':
            return jsonify({'error': 'Заявка уже обработана'}), 400
        if status == 'approved':
            product_id = None
            try:
                product_id = req['product_id']
            except Exception:
                product_id = None

            product_row = None

            if product_id:
                product_row = cursor.execute(
                    "SELECT * FROM products WHERE id = ?",
                    (product_id,)
                ).fetchone()
            if not product_row:
                product_row = cursor.execute(
                    "SELECT * FROM products WHERE name = ? AND unit = ? LIMIT 1",
                    (req['product_name'], req['unit'])
                ).fetchone()
            if not product_row:
                cursor.execute(
                    "INSERT INTO products (name, quantity, unit, min_quantity) VALUES (?, ?, ?, ?)",
                    (req['product_name'], 0, req['unit'], 0)
                )
                new_id = cursor.lastrowid
                product_row = cursor.execute(
                    "SELECT * FROM products WHERE id = ?",
                    (new_id,)
                ).fetchone()
            if product_row and product_row['unit'] != req['unit']:
                return jsonify({'error': f"Единицы измерения не совпадают: в продуктах {product_row['unit']}, в заявке {req['unit']}"}), 400
            cursor.execute(
                "UPDATE products SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (float(req['quantity']), int(product_row['id']))
            )
            try:
                cursor.execute(
                    "UPDATE purchase_requests SET product_id = ? WHERE id = ?",
                    (int(product_row['id']), request_id)
                )
            except Exception:
                pass
        cursor.execute(
            "UPDATE purchase_requests SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
            (status, session['user_id'], request_id)
        )

        
        try:
            requester_id = int(req['requested_by'])
            action_label = 'одобрена' if status == 'approved' else 'отклонена'
            prod = f"{req['product_name']} — {format(req['quantity'], '.2f').rstrip('0').rstrip('.') if req['quantity'] is not None else ''} {req['unit']}"
            _add_notification(
                cursor,
                title='Заявка на закупку',
                message=f"Ваша заявка #{request_id} {action_label}. {prod}",
                audience='staff',
                recipient_id=requester_id,
                created_by=session['user_id']
            )
        except Exception:
            pass

        db.commit()
    finally:
        db.close()

    return jsonify({'message': 'Заявка обработана'}), 200

@app.route('/api/statistics')
@login_required
@role_required('admin')
def get_statistics():
    db = get_db()
    cursor = db.cursor()
    payments_stats = cursor.execute(
        "SELECT SUM(amount) as total, COUNT(*) as count FROM payments WHERE DATE(created_at) >= DATE('now', '-30 days')"
    ).fetchone()
    visits_stats = cursor.execute(
        "SELECT meal_type, COUNT(*) as count FROM meal_claims WHERE DATE(claimed_at) >= DATE('now', '-30 days') GROUP BY meal_type"
    ).fetchall()
    active_students = cursor.execute(
        "SELECT COUNT(DISTINCT user_id) as cnt FROM meal_claims WHERE DATE(claimed_at) >= DATE('now', '-30 days')"
    ).fetchone()

    db.close()

    return jsonify({
        'payments': dict(payments_stats) if payments_stats else {},
        'visits': [dict(v) for v in visits_stats],
        'active_students': (active_students['cnt'] if active_students else 0) or 0
    })


def _safe_int(value, default):
    try:
        return int(value)
    except Exception:
        return default


def _compute_report_summary(cursor, days: int = 30):
    days = max(1, int(days or 30))
    date_expr = f"-{days} days"

    total_revenue = cursor.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE DATE(created_at) >= DATE('now', ?)",
        (date_expr,)
    ).fetchone()[0] or 0

    total_meals = cursor.execute(
        "SELECT COALESCE(COUNT(*), 0) FROM meal_claims WHERE DATE(claimed_at) >= DATE('now', ?)",
        (date_expr,)
    ).fetchone()[0] or 0

    active_students = cursor.execute(
        "SELECT COALESCE(COUNT(DISTINCT user_id), 0) FROM meal_claims WHERE DATE(claimed_at) >= DATE('now', ?)",
        (date_expr,)
    ).fetchone()[0] or 0

    pending_requests = cursor.execute(
        "SELECT COALESCE(COUNT(*), 0) FROM purchase_requests WHERE status = 'pending'"
    ).fetchone()[0] or 0

    total_costs = cursor.execute(
        """
        SELECT COALESCE(SUM(estimated_cost), 0)
        FROM purchase_requests
        WHERE status = 'approved'
          AND DATE(created_at) >= DATE('now', ?)
        """,
        (date_expr,)
    ).fetchone()[0] or 0

    profit = (total_revenue or 0) - (total_costs or 0)

    def _n(x):
        try:
            x = float(x or 0)
            return int(x) if abs(x - int(x)) < 1e-9 else x
        except Exception:
            return 0
    return {
        'total_revenue': _n(total_revenue),
        'total_costs': _n(total_costs),
        'profit': _n(profit),
        'total_meals': int(total_meals or 0),
        'active_students': int(active_students or 0),
        'pending_requests': int(pending_requests or 0)
    }


def _collect_full_report(cursor, days: int = 30):
    days = max(1, int(days or 30))
    date_expr = f"-{days} days"

    summary = _compute_report_summary(cursor, days=days)
    visits_by_meal = []
    try:
        visits_by_meal = [
            dict(r)
            for r in cursor.execute(
                """
                SELECT meal_type, COUNT(*) as count
                FROM meal_claims
                WHERE DATE(claimed_at) >= DATE('now', ?)
                GROUP BY meal_type
                ORDER BY meal_type
                """,
                (date_expr,)
            ).fetchall()
        ]
    except Exception:
        visits_by_meal = []

    payments_breakdown = []
    try:
        payments_breakdown = [
            dict(r)
            for r in cursor.execute(
                """
                SELECT payment_type,
                       meal_type,
                       COUNT(*) as count,
                       COALESCE(SUM(amount), 0) as total
                FROM payments
                WHERE DATE(created_at) >= DATE('now', ?)
                GROUP BY payment_type, meal_type
                ORDER BY payment_type, meal_type
                """,
                (date_expr,)
            ).fetchall()
        ]
    except Exception:
        payments_breakdown = []

    top_dishes = []
    try:
        top_dishes = [
            dict(r)
            for r in cursor.execute(
                """
                SELECT m.name as dish_name,
                       m.category as category,
                       COUNT(*) as count
                FROM meal_claims mc
                LEFT JOIN menu_items m ON mc.menu_item_id = m.id
                WHERE DATE(mc.claimed_at) >= DATE('now', ?)
                  AND mc.menu_item_id IS NOT NULL
                GROUP BY mc.menu_item_id
                ORDER BY count DESC
                LIMIT 10
                """,
                (date_expr,)
            ).fetchall()
        ]
    except Exception:
        top_dishes = []

    low_stock_products = []
    try:
        low_stock_products = [
            dict(r)
            for r in cursor.execute(
                """
                SELECT name, quantity, unit, min_quantity
                FROM products
                WHERE quantity < min_quantity
                ORDER BY (min_quantity - quantity) DESC, name
                """
            ).fetchall()
        ]
    except Exception:
        low_stock_products = []

    pending_requests_list = []
    try:
        pending_requests_list = [
            dict(r)
            for r in cursor.execute(
                """
                SELECT pr.id,
                       pr.product_name,
                       pr.quantity,
                       pr.unit,
                       pr.estimated_cost,
                       pr.reason,
                       pr.created_at,
                       u.full_name as requested_by_name
                FROM purchase_requests pr
                LEFT JOIN users u ON pr.requested_by = u.id
                WHERE pr.status = 'pending'
                ORDER BY pr.created_at DESC
                """
            ).fetchall()
        ]
    except Exception:
        pending_requests_list = []

    end_dt = datetime.now()
    start_dt = end_dt - timedelta(days=days)

    return {
        'period': {
            'days': days,
            'from': start_dt.strftime('%Y-%m-%d'),
            'to': end_dt.strftime('%Y-%m-%d'),
        },
        'summary': summary,
        'visits_by_meal': visits_by_meal,
        'payments_breakdown': payments_breakdown,
        'top_dishes': top_dishes,
        'low_stock_products': low_stock_products,
        'pending_purchase_requests': pending_requests_list,
    }


def _maybe_save_report_bytes(filename: str, data: bytes):
    try:
        os.makedirs(REPORTS_DIR, exist_ok=True)
        path = os.path.join(REPORTS_DIR, filename)
        with open(path, 'wb') as f:
            f.write(data)
        return path
    except Exception:
        return None


def _build_report_pdf(report: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    buffer = io.BytesIO()

    font_name = 'Helvetica'
    font_name_bold = 'Helvetica-Bold'

    def _first_existing(paths):
        for p in paths:
            try:
                if p and os.path.exists(p):
                    return p
            except Exception:
                pass
        return None
    bundled_regular = os.path.join(BASE_DIR, 'fonts', 'DejaVuSans.ttf')
    bundled_bold = os.path.join(BASE_DIR, 'fonts', 'DejaVuSans-Bold.ttf')

    regular_path = _first_existing([
        bundled_regular,
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/dejavu/dejavusans.ttf',
        '/usr/share/fonts/dejavu/DejaVuSans.ttf',
        '/Library/Fonts/DejaVuSans.ttf',
        r'C:\Windows\Fonts\DejaVuSans.ttf',
        r'C:\Windows\Fonts\arial.ttf',
    ])

    bold_path = _first_existing([
        bundled_bold,
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/dejavu/dejavusans-bold.ttf',
        '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
        '/Library/Fonts/DejaVuSans-Bold.ttf',
        r'C:\Windows\Fonts\DejaVuSans-Bold.ttf',
        r'C:\Windows\Fonts\arialbd.ttf',
    ])

    try:
        if regular_path:
            if 'DejaVuSans' not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont('DejaVuSans', regular_path))
            font_name = 'DejaVuSans'

        if bold_path:
            if 'DejaVuSans-Bold' not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', bold_path))
            font_name_bold = 'DejaVuSans-Bold'
        else:
            font_name_bold = font_name
    except Exception:
        font_name = 'Helvetica'
        font_name_bold = 'Helvetica-Bold'

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
        title='Отчет столовой'
    )

    styles = getSampleStyleSheet()
    style_title = ParagraphStyle(
        'ruTitle',
        parent=styles['Heading1'],
        fontName=font_name_bold,
        fontSize=18,
        leading=22,
        spaceAfter=12,
    )
    style_h2 = ParagraphStyle(
        'ruH2',
        parent=styles['Heading2'],
        fontName=font_name_bold,
        fontSize=14,
        leading=18,
        spaceBefore=12,
        spaceAfter=8,
    )
    style_n = ParagraphStyle(
        'ruNormal',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=11,
        leading=14,
    )

    period = report.get('period') or {}
    summary = report.get('summary') or {}

    elems = []
    elems.append(Paragraph('Отчет по школьной столовой', style_title))
    elems.append(
        Paragraph(
            f"Период: {period.get('from', '')} — {period.get('to', '')} (последние {period.get('days', '')} дн.)",
            style_n,
        )
    )
    elems.append(Paragraph(f"Сформирован: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", style_n))
    elems.append(Spacer(1, 12))
    elems.append(Paragraph('Сводка', style_h2))
    summary_table = [
        ['Показатель', 'Значение'],
        ['Выручка', f"{summary.get('total_revenue', 0)} ₽"],
        ['Затраты на закупки (одобренные)', f"{summary.get('total_costs', 0)} ₽"],
        ['Прибыль (выручка − затраты)', f"{summary.get('profit', 0)} ₽"],
        ['Выдано питаний', f"{summary.get('total_meals', 0)}"],
        ['Активных учеников', f"{summary.get('active_students', 0)}"],
        ['Заявок на рассмотрении', f"{summary.get('pending_requests', 0)}"],
    ]

    t = Table(summary_table, hAlign='LEFT', colWidths=[270, 230])
    t.setStyle(
        TableStyle(
            [
                ('FONTNAME', (0, 0), (-1, -1), font_name),
                    ('FONTNAME', (0, 0), (-1, 0), font_name_bold),
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F3F4F6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#111827')),
                ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#D1D5DB')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('PADDING', (0, 0), (-1, -1), 6),
            ]
        )
    )
    elems.append(t)
    visits = report.get('visits_by_meal') or []
    if visits:
        elems.append(Paragraph('Выдача питания по типам', style_h2))
        v_table = [['Тип питания', 'Количество']]
        meal_map = {'breakfast': 'Завтрак', 'lunch': 'Обед'}
        for v in visits:
            v_table.append([meal_map.get(v.get('meal_type'), v.get('meal_type')), str(v.get('count', 0))])
        vt = Table(v_table, hAlign='LEFT', colWidths=[270, 230])
        vt.setStyle(
            TableStyle(
                [
                    ('FONTNAME', (0, 0), (-1, -1), font_name),
                    ('FONTNAME', (0, 0), (-1, 0), font_name_bold),
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F9FAFB')),
                    ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#E5E7EB')),
                    ('PADDING', (0, 0), (-1, -1), 6),
                ]
            )
        )
        elems.append(vt)
    low_stock = report.get('low_stock_products') or []
    if low_stock:
        elems.append(Paragraph('Продукты ниже минимального остатка', style_h2))
        p_table = [['Продукт', 'Остаток', 'Мин. остаток']]
        for p in low_stock:
            p_table.append(
                [
                    str(p.get('name', '')),
                    f"{p.get('quantity', '')} {p.get('unit', '')}",
                    f"{p.get('min_quantity', '')} {p.get('unit', '')}",
                ]
            )
        pt = Table(p_table, hAlign='LEFT', colWidths=[220, 140, 140])
        pt.setStyle(
            TableStyle(
                [
                    ('FONTNAME', (0, 0), (-1, -1), font_name),
                    ('FONTNAME', (0, 0), (-1, 0), font_name_bold),
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#FEF3C7')),
                    ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#F59E0B')),
                    ('PADDING', (0, 0), (-1, -1), 6),
                ]
            )
        )
        elems.append(pt)
    pending = report.get('pending_purchase_requests') or []
    if pending:
        elems.append(Paragraph('Заявки на закупку (ожидают рассмотрения)', style_h2))
        r_table = [['ID', 'Продукт', 'Кол-во', 'Стоимость', 'Заявитель', 'Дата']]
        for r in pending[:25]:
            r_table.append(
                [
                    str(r.get('id', '')),
                    str(r.get('product_name', '')),
                    f"{r.get('quantity', '')} {r.get('unit', '')}",
                    f"{r.get('estimated_cost', 0) or 0} ₽" if r.get('estimated_cost') not in (None, '') else '-',
                    str(r.get('requested_by_name', '') or ''),
                    str(r.get('created_at', '') or '')[:10],
                ]
            )
        rt = Table(r_table, hAlign='LEFT', colWidths=[36, 150, 90, 70, 120, 70])
        rt.setStyle(
            TableStyle(
                [
                    ('FONTNAME', (0, 0), (-1, -1), font_name),
                    ('FONTNAME', (0, 0), (-1, 0), font_name_bold),
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#EFF6FF')),
                    ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#BFDBFE')),
                    ('PADDING', (0, 0), (-1, -1), 4),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                ]
            )
        )
        elems.append(rt)
    top_dishes = report.get('top_dishes') or []
    if top_dishes:
        elems.append(Paragraph('Топ-10 блюд по выдаче', style_h2))
        d_table = [['Блюдо', 'Категория', 'Кол-во']]
        meal_map = {'breakfast': 'Завтрак', 'lunch': 'Обед'}
        for d in top_dishes:
            d_table.append([
                str(d.get('dish_name', '')),
                meal_map.get(d.get('category'), str(d.get('category', ''))),
                str(d.get('count', 0)),
            ])
        dt = Table(d_table, hAlign='LEFT', colWidths=[270, 140, 90])
        dt.setStyle(
            TableStyle(
                [
                    ('FONTNAME', (0, 0), (-1, -1), font_name),
                    ('FONTNAME', (0, 0), (-1, 0), font_name_bold),
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F3F4F6')),
                    ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#E5E7EB')),
                    ('PADDING', (0, 0), (-1, -1), 6),
                ]
            )
        )
        elems.append(dt)

    doc.build(elems)
    buffer.seek(0)
    return buffer.getvalue()


def _build_report_csv(report: dict) -> bytes:
    out = io.StringIO()
    writer = csv.writer(out, delimiter=';')

    period = report.get('period') or {}
    summary = report.get('summary') or {}

    writer.writerow(['Отчет по школьной столовой'])
    writer.writerow(['Период', f"{period.get('from', '')} — {period.get('to', '')}"])
    writer.writerow(['Дней', period.get('days', '')])
    writer.writerow(['Сформирован', datetime.now().strftime('%Y-%m-%d %H:%M:%S')])
    writer.writerow([])

    writer.writerow(['Показатель', 'Значение'])
    writer.writerow(['Выручка', summary.get('total_revenue', 0)])
    writer.writerow(['Затраты на закупки (одобренные)', summary.get('total_costs', 0)])
    writer.writerow(['Прибыль', summary.get('profit', 0)])
    writer.writerow(['Выдано питаний', summary.get('total_meals', 0)])
    writer.writerow(['Активных учеников', summary.get('active_students', 0)])
    writer.writerow(['Заявок на рассмотрении', summary.get('pending_requests', 0)])
    writer.writerow([])

    visits = report.get('visits_by_meal') or []
    if visits:
        writer.writerow(['Выдача питания по типам'])
        writer.writerow(['Тип питания', 'Количество'])
        meal_map = {'breakfast': 'Завтрак', 'lunch': 'Обед'}
        for v in visits:
            writer.writerow([meal_map.get(v.get('meal_type'), v.get('meal_type')), v.get('count', 0)])
        writer.writerow([])

    low_stock = report.get('low_stock_products') or []
    if low_stock:
        writer.writerow(['Продукты ниже минимального остатка'])
        writer.writerow(['Продукт', 'Остаток', 'Ед.', 'Мин. остаток'])
        for p in low_stock:
            writer.writerow([p.get('name', ''), p.get('quantity', ''), p.get('unit', ''), p.get('min_quantity', '')])
        writer.writerow([])

    pending = report.get('pending_purchase_requests') or []
    if pending:
        writer.writerow(['Заявки на закупку (ожидают рассмотрения)'])
        writer.writerow(['ID', 'Продукт', 'Количество', 'Ед.', 'Стоимость', 'Заявитель', 'Дата'])
        for r in pending:
            writer.writerow([
                r.get('id', ''),
                r.get('product_name', ''),
                r.get('quantity', ''),
                r.get('unit', ''),
                r.get('estimated_cost', ''),
                r.get('requested_by_name', ''),
                str(r.get('created_at', '') or '')[:10],
            ])

    data = out.getvalue().encode('utf-8-sig')
    return data


@app.route('/api/report')
@login_required
@role_required('admin')
def generate_report():
    days = _safe_int(request.args.get('days'), 30)

    db = get_db()
    cursor = db.cursor()
    try:
        summary = _compute_report_summary(cursor, days=days)
        return jsonify(summary)
    finally:
        db.close()


@app.route('/api/report/download')
@login_required
@role_required('admin')
def download_report_file():
    fmt = (request.args.get('format') or 'pdf').strip().lower()
    days = _safe_int(request.args.get('days'), 30)

    db = get_db()
    cursor = db.cursor()
    try:
        report = _collect_full_report(cursor, days=days)
    finally:
        db.close()

    ts = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    base_name = f"canteen_report_{ts}_{days}d"

    if fmt == 'pdf':
        data = _build_report_pdf(report)
        filename = f"{base_name}.pdf"
        _maybe_save_report_bytes(filename, data)
        return send_file(
            io.BytesIO(data),
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename,
        )

    if fmt == 'csv':
        data = _build_report_csv(report)
        filename = f"{base_name}.csv"
        _maybe_save_report_bytes(filename, data)
        return send_file(
            io.BytesIO(data),
            mimetype='text/csv; charset=utf-8',
            as_attachment=True,
            download_name=filename,
        )

    if fmt == 'json':
        data = json.dumps(report, ensure_ascii=False, indent=2).encode('utf-8')
        filename = f"{base_name}.json"
        _maybe_save_report_bytes(filename, data)
        return send_file(
            io.BytesIO(data),
            mimetype='application/json; charset=utf-8',
            as_attachment=True,
            download_name=filename,
        )

    return jsonify({'error': 'Некорректный формат. Доступно: pdf, csv, json'}), 400

@app.route('/api/admin/attendance/today', methods=['GET'])
@login_required
def get_today_attendance():
    """Получить статистику посещаемости за сегодня"""
    if session.get('role') != 'admin':
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    db = get_db()
    cursor = db.cursor()
    
    today = datetime.now().date()
    
    try:
        total_query = """
            SELECT COUNT(DISTINCT student_id) as total
            FROM meal_claims
            WHERE DATE(claimed_at) = ?
        """
        total_result = cursor.execute(total_query, (today,)).fetchone()
        total = total_result['total'] if total_result else 0
        
        breakfast_query = """
            SELECT COUNT(DISTINCT student_id) as count
            FROM meal_claims
            WHERE DATE(claimed_at) = ? AND meal_type = 'breakfast'
        """
        breakfast_result = cursor.execute(breakfast_query, (today,)).fetchone()
        breakfast_count = breakfast_result['count'] if breakfast_result else 0
        
        lunch_query = """
            SELECT COUNT(DISTINCT student_id) as count
            FROM meal_claims
            WHERE DATE(claimed_at) = ? AND meal_type = 'lunch'
        """
        lunch_result = cursor.execute(lunch_query, (today,)).fetchone()
        lunch_count = lunch_result['count'] if lunch_result else 0
        
        return jsonify({
            'total': total,
            'breakfast': breakfast_count,
            'lunch': lunch_count
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/cook/dishes', methods=['GET'])
@login_required
def get_cook_dishes():
    """Получить список блюд для контроля повара"""
    if session.get('role') != 'cook':
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    db = get_db()
    cursor = db.cursor()
    
    try:
        dishes_query = """
            SELECT 
                id,
                name,
                category,
                price,
                description,
                allergens,
                CASE WHEN available = 1 THEN 1 ELSE 0 END as available
            FROM menu_items
            ORDER BY category, name
        """
        dishes = cursor.execute(dishes_query).fetchall()

        result = []
        for dish in dishes:
            ingredients = []
            try:
                ing_rows = cursor.execute(
                    """
                    SELECT di.product_id,
                           p.name as product_name,
                           p.unit as unit,
                           di.quantity as quantity
                    FROM dish_ingredients di
                    JOIN products p ON p.id = di.product_id
                    WHERE di.dish_id = ?
                    ORDER BY p.name
                    """,
                    (dish['id'],)
                ).fetchall()
                ingredients = [
                    {
                        'product_id': r['product_id'],
                        'product_name': r['product_name'],
                        'unit': r['unit'],
                        'quantity': float(r['quantity'])
                    } for r in ing_rows
                ]
            except Exception:
                ingredients = []

            result.append({
                'id': dish['id'],
                'name': dish['name'],
                'category': dish['category'],
                'price': float(dish['price']),
                'description': dish['description'] or '',
                'allergens': dish['allergens'] or '',
                'available': bool(dish['available']),
                'ingredients': ingredients
            })
        
        return jsonify({'dishes': result})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()




@app.route('/api/cook/dishes', methods=['POST'])
@login_required
@role_required('cook')
def create_cook_dish():
    """Создать новое блюдо + сохранить рецептуру (ингредиенты и количества)."""
    data = request.json or {}

    name = (data.get('name') or '').strip()
    category = (data.get('category') or '').strip()
    description = (data.get('description') or '').strip()
    allergens = (data.get('allergens') or '').strip()

    if not name:
        return jsonify({'error': 'Укажите название блюда'}), 400
    if category not in ('breakfast', 'lunch'):
        return jsonify({'error': 'Некорректная категория'}), 400

    try:
        price = float(data.get('price'))
    except Exception:
        return jsonify({'error': 'Некорректная цена'}), 400

    if price < 0:
        return jsonify({'error': 'Цена не может быть отрицательной'}), 400

    ingredients = data.get('ingredients')
    if not isinstance(ingredients, list) or len(ingredients) == 0:
        return jsonify({'error': 'Укажите ингредиенты и их количество'}), 400

    ing_map = {}
    for ing in ingredients:
        if not isinstance(ing, dict):
            continue
        try:
            pid = int(ing.get('product_id'))
            qty = float(ing.get('quantity'))
        except Exception:
            return jsonify({'error': 'Некорректные ингредиенты'}), 400

        if qty <= 0:
            return jsonify({'error': 'Количество ингредиента должно быть больше 0'}), 400

        ing_map[pid] = ing_map.get(pid, 0.0) + qty

    if not ing_map:
        return jsonify({'error': 'Укажите ингредиенты и их количество'}), 400

    db = get_db()
    cursor = db.cursor()

    try:
        missing_products = []
        for pid in ing_map.keys():
            row = cursor.execute("SELECT id FROM products WHERE id = ? LIMIT 1", (pid,)).fetchone()
            if not row:
                missing_products.append(pid)

        if missing_products:
            return jsonify({'error': f"Продукты не найдены: {', '.join(str(i) for i in missing_products)}"}), 404

        cursor.execute(
            "INSERT INTO menu_items (name, category, price, description, allergens, available) VALUES (?, ?, ?, ?, ?, 1)",
            (name, category, price, description or None, allergens or None)
        )
        dish_id = cursor.lastrowid

        for pid, qty in ing_map.items():
            cursor.execute(
                "INSERT OR REPLACE INTO dish_ingredients (dish_id, product_id, quantity) VALUES (?, ?, ?)",
                (dish_id, int(pid), float(qty))
            )

        db.commit()
        return jsonify({'message': 'Блюдо создано', 'dish_id': dish_id}), 201

    except sqlite3.IntegrityError:
        db.rollback()
        return jsonify({'error': 'Блюдо с таким названием уже существует в этой категории'}), 409
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/cook/dishes/<int:dish_id>/availability', methods=['POST'])
@login_required
def toggle_dish_availability(dish_id):
    """Переключить доступность блюда"""
    if session.get('role') != 'cook':
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    data = request.get_json() or {}
    available = data.get('available', False)
    
    db = get_db()
    cursor = db.cursor()
    
    try:
        dish = cursor.execute(
            "SELECT id FROM menu_items WHERE id = ?", 
            (dish_id,)
        ).fetchone()
        
        if not dish:
            return jsonify({'error': 'Блюдо не найдено'}), 404
        
        cursor.execute(
            "UPDATE menu_items SET available = ? WHERE id = ?",
            (1 if available else 0, dish_id)
        )
        db.commit()
        
        status_text = 'доступно' if available else 'недоступно'
        return jsonify({
            'success': True,
            'message': f'Блюдо теперь {status_text}'
        })
        
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/cook/stats', methods=['GET'])
@login_required
def get_cook_stats():
    """Получить статистику для повара"""
    if session.get('role') != 'cook':
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    db = get_db()
    cursor = db.cursor()
    
    today = datetime.now().date()
    
    try:
        breakfast_query = """
            SELECT COUNT(*) as count
            FROM meal_claims
            WHERE DATE(claimed_at) = ? AND meal_type = 'breakfast'
        """
        breakfast_result = cursor.execute(breakfast_query, (today,)).fetchone()
        breakfast_count = breakfast_result['count'] if breakfast_result else 0
        
        lunch_query = """
            SELECT COUNT(*) as count
            FROM meal_claims
            WHERE DATE(claimed_at) = ? AND meal_type = 'lunch'
        """
        lunch_result = cursor.execute(lunch_query, (today,)).fetchone()
        lunch_count = lunch_result['count'] if lunch_result else 0
        
        return jsonify({
            'breakfast': breakfast_count,
            'lunch': lunch_count
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/meal-claims/today', methods=['GET'])
@login_required
@role_required('student')
def get_today_meal_claims():
    """История выдачи питания за сегодня для текущего ученика (включая подтверждение)."""
    student_id = session.get('user_id')

    db = get_db()
    cursor = db.cursor()

    today = datetime.now().date().strftime('%Y-%m-%d')

    try:
        try:
            ensure_column(cursor, 'meal_claims', 'student_received', 'INTEGER')
            ensure_column(cursor, 'meal_claims', 'student_marked_at', 'TIMESTAMP')
        except Exception:
            pass

        rows = cursor.execute(
            '''
            SELECT
                mc.id,
                mc.meal_type,
                mc.claimed_at,
                mc.issued_by,
                iu.full_name AS issuer_name,
                mc.menu_item_id,
                mi.name AS dish_name,
                mc.student_received,
                mc.student_marked_at
            FROM meal_claims mc
            LEFT JOIN users iu ON iu.id = mc.issued_by
            LEFT JOIN menu_items mi ON mi.id = mc.menu_item_id
            WHERE mc.user_id = ?
              AND DATE(mc.claimed_at) = ?
            ORDER BY datetime(mc.claimed_at) DESC, mc.id DESC
            ''',
            (student_id, today)
        ).fetchall()

        return jsonify([dict(r) for r in rows])

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/meal-claims/<int:claim_id>/confirm', methods=['POST'])
@login_required
@role_required('student')
def confirm_meal_claim(claim_id: int):
    """Ученик подтверждает: получил питание или нет."""
    data = request.json or {}
    raw = data.get('received')

    received = None
    if raw in (True, 1, '1', 'true', 'True', 'yes', 'да', 'Да', 'ДА'):
        received = 1
    if raw in (False, 0, '0', 'false', 'False', 'no', 'нет', 'Нет', 'НЕТ'):
        received = 0

    if received is None:
        return jsonify({'error': 'Передайте received=true/false'}), 400

    db = get_db()
    cursor = db.cursor()
    try:
        try:
            ensure_column(cursor, 'meal_claims', 'student_received', 'INTEGER')
            ensure_column(cursor, 'meal_claims', 'student_marked_at', 'TIMESTAMP')
        except Exception:
            pass

        row = cursor.execute(
            "SELECT id, meal_type, student_received FROM meal_claims WHERE id = ? AND user_id = ?",
            (claim_id, session['user_id'])
        ).fetchone()
        if not row:
            return jsonify({'error': 'Запись не найдена'}), 404


        try:
            already = row['student_received']
        except Exception:
            already = None

        if already is not None and int(already) == int(received):
            if int(received) == 1:
                return jsonify({'error': 'Это питание уже получено.'}), 409
            return jsonify({'error': 'Вы уже отметили это питание.'}), 409

        cursor.execute(
            "UPDATE meal_claims SET student_received = ?, student_marked_at = CURRENT_TIMESTAMP WHERE id = ?",
            (received, claim_id)
        )
        db.commit()

        return jsonify({'message': 'Отметка сохранена', 'student_received': received}), 200

    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=8080)
