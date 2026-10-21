from django.core.management.base import BaseCommand
from stores.models import Store, Product, Price, Stock
from logistics.models import Supplier, Delivery, Transport
from datetime import date, timedelta

class Command(BaseCommand):
    help = 'Заполняет базы данных тестовыми данными'

    def handle(self, *args, **kwargs):
        Stock.objects.using('db_stores').all().delete()
        Price.objects.using('db_stores').all().delete()
        Product.objects.using('db_stores').all().delete()
        Store.objects.using('db_stores').all().delete()
        Transport.objects.using('db_logistics').all().delete()
        Delivery.objects.using('db_logistics').all().delete()
        Supplier.objects.using('db_logistics').all().delete()

        # Магазины
        s1 = Store.objects.using('db_stores').create(name="Пятерочка", address="ул. Ленина, 10", region="Москва")
        s2 = Store.objects.using('db_stores').create(name="Магнит", address="пр. Мира, 5", region="СПБ")
        p1 = Product.objects.using('db_stores').create(name="Молоко", category="Молочные", unit="л")
        p2 = Product.objects.using('db_stores').create(name="Хлеб", category="Хлеб", unit="шт")
        
        Price.objects.using('db_stores').create(store=s1, product=p1, price=85.50)
        Price.objects.using('db_stores').create(store=s2, product=p1, price=89.00)
        Stock.objects.using('db_stores').create(store=s1, product=p1, quantity=150)
        Stock.objects.using('db_stores').create(store=s2, product=p1, quantity=200)

        # Логистика
        sup1 = Supplier.objects.using('db_logistics').create(name="Молокозавод №1", contact_phone="+7(999)111-22-33")
        d1 = Delivery.objects.using('db_logistics').create(supplier=sup1, delivery_date=date.today(), status="Доставлено")
        Transport.objects.using('db_logistics').create(delivery=d1, vehicle_number="А123ВС77", driver_name="Иванов И.И.")

        self.stdout.write(self.style.SUCCESS("Данные успешно добавлены!"))