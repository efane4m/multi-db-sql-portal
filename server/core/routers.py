class DatabaseRouter:
    def db_for_read(self, model, **hints):
        if model._meta.app_label == 'stores': return 'db_stores'
        if model._meta.app_label == 'logistics': return 'db_logistics'
        return 'default'

    def db_for_write(self, model, **hints):
        if model._meta.app_label == 'stores': return 'db_stores'
        if model._meta.app_label == 'logistics': return 'db_logistics'
        return 'default'

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if db.startswith('query_'):
            return False
        if app_label == 'stores': 
            return db == 'db_stores'
        if app_label == 'logistics': 
            return db == 'db_logistics'
        return db == 'default'
