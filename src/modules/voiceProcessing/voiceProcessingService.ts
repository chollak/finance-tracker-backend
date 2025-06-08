import { OpenAI } from "openai";
import fs from "fs";
import path from "path";
import { OPENAI_API_KEY } from "../../config";
import { analyzeSpending } from "./textProcessingService";
import { NotionService } from "../../infrastructure/services/notionService";
import { NotionRepository } from "../transaction/infrastructure/notionRepository";
import { CreateTransactionUseCase } from "../transaction/application/createTransaction";
import { Transaction } from "../transaction/domain/transactionEntity";


const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const notionService = new NotionService();
const notionRepository = new NotionRepository(notionService);
const createTransactionUseCase = new CreateTransactionUseCase(notionRepository);

export async function processVoiceInput(filePath: string): Promise<{ text: string, amount: number, category: string, type: "income" | "expense" }> {
    try {
        const fileExt = ".mp3";
        const newFilePath = filePath + fileExt;

        // Переименовываем файл, чтобы добавить расширение
        fs.renameSync(filePath, newFilePath);
        console.log("Renamed file for Whisper API:", newFilePath);

        const fileStream = fs.createReadStream(newFilePath);

        const response = await openai.audio.transcriptions.create({
            model: "whisper-1",
            file: fileStream,
            response_format: "json",
        });

        const recognizedText = response.text;

        // Анализируем текст и получаем сумму, категорию и тип транзакции
        const { amount, category, type } = await analyzeSpending(recognizedText);

        // Создаем объект транзакции
        const transaction: Transaction = {
            date: new Date().toISOString(),
            category,
            description: recognizedText,
            amount,
            type, // Теперь берем тип из анализа текста
        };

        // Сохраняем транзакцию в Notion через use case
        await createTransactionUseCase.execute(transaction);
        console.log("Transaction saved to Notion:", transaction);

        // Удаляем временные файлы
        fs.unlinkSync(newFilePath);

        return { text: recognizedText, amount, category, type };
    } catch (error) {
        console.error("Error processing voice input:", error);
        throw new Error("Failed to process audio file.");
    }
}

export async function processTextInput(text: string): Promise<{ text: string, amount: number, category: string, type: "income" | "expense" }> {
    try {
        const recognizedText = text;

        // Анализируем текст и получаем сумму, категорию и тип транзакции
        const { amount, category, type } = await analyzeSpending(recognizedText);

        // Создаем объект транзакции
        const transaction: Transaction = {
            date: new Date().toISOString(),
            category,
            description: recognizedText,
            amount,
            type, // Теперь берем тип из анализа текста
        };

        // Сохраняем транзакцию в Notion через use case
        await createTransactionUseCase.execute(transaction);
        console.log("Transaction saved to Notion:", transaction);

        return { text: recognizedText, amount, category, type };
    } catch (error) {
        console.error("Error processing voice input:", error);
        throw new Error("Failed to process audio file.");
    }
}