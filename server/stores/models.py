from django.db import models

# Create your models here.
class Store(models.Model):
    name = models.CharField(max_length=255)
    address = models.TextField()
    region = models.CharField(max_length=100)

class Product(models.Model):
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100)
    unit = models.CharField(max_length=20, default="шт")

class Price(models.Model):
    store = models.ForeignKey(Store, on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    price = models.DecimalField(max_digits=10, decimal_places=2)

class Stock(models.Model):
    store = models.ForeignKey(Store, on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.IntegerField()