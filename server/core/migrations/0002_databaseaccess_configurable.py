from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0001_initial')]
    operations = [migrations.AlterField(
        model_name='databaseaccess', name='db_name', field=models.CharField(max_length=50),
    )]
