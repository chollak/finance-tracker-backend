# Указываем базовый образ
FROM node:18-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json (или yarn.lock, если используешь Yarn)
COPY package*.json ./
COPY webapp ./webapp
COPY src ./src
COPY tsconfig.json ./
COPY .env .env
COPY downloads ./downloads

# Устанавливаем зависимости
RUN npm install
RUN npm run build:webapp
RUN npm run build

# Открываем порт, который будет использовать приложение
EXPOSE 3000

# Указываем команду для запуска приложения
CMD ["npm", "start"]

