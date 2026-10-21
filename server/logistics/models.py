from django.db import models

# Create your models here.
class Supplier(models.Model):
    name = models.CharField(max_length=255)
    contact_phone = models.CharField(max_length=20)

class Delivery(models.Model):
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE)
    delivery_date = models.DateField()
    status = models.CharField(max_length=50, default="В пути")

class Transport(models.Model):
    delivery = models.ForeignKey(Delivery, on_delete=models.CASCADE)
    vehicle_number = models.CharField(max_length=20)
    driver_name = models.CharField(max_length=150)