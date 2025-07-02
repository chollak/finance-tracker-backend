# Указываем базовый образ
FROM node:18-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json (или yarn.lock, если используешь Yarn)
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем все файлы проекта в контейнер
COPY . .

# Собираем TypeScript код
RUN npm run build

# Открываем порт, который будет использовать приложение
EXPOSE 3000

# Указываем команду для запуска приложения
CMD ["npm", "run", "start"]

