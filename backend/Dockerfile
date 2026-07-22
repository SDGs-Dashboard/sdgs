FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY data/NISR_SDG_Automation_Mapping_Built.xlsx ./data/NISR_SDG_Automation_Mapping_Built.xlsx

RUN mkdir -p ./data/uploads ./data/processed ./data/exports

ENV PORT=8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
