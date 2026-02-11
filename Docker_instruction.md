# Docker

## Требования
- Установлен **Docker Desktop** (macOS).

## Запуск
```bash
cd "predprof2026_canteen"

mkdir -p data

docker-compose up --build
```

Открыть в браузере: http://localhost:8000

## Команды
```bash

docker-compose up -d --build

docker-compose logs -f

docker-compose ps

docker-compose down

docker-compose build --no-cache
```

## Где хранятся данные
- `./data/canteen.db` — база SQLite
- `./data/reports/` — отчёты
