FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8000
ENV DATABASE_PATH=/data/expenses.db

EXPOSE 8000

CMD ["gunicorn", "run:app", "-c", "gunicorn.conf.py"]
