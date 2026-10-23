class QueryError(Exception):
    def __init__(self, message, code='invalid_query', status=400):
        super().__init__(message)
        self.code = code
        self.status = status
