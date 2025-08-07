interface HomePageProps {
  userId: string | null;
}

export default function HomePage({ userId }: HomePageProps) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Welcome to FinTrack!</h2>
      {userId ? (
        <div>
          <p className="mb-4">User ID: {userId}</p>
          <p className="text-gray-600">
            Use the navigation above to view your transactions and statistics.
          </p>
        </div>
      ) : (
        <p className="text-gray-600">
          Please access this app through Telegram to see your personal finance data.
        </p>
      )}
    </div>
  );
}