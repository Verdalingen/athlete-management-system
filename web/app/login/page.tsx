import { LoginCard } from "./LoginCard";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; mode?: string }>;
}) {
  const { error, message, mode } = await searchParams;
  return (
    <LoginCard
      initialMode={mode === "signup" ? "signup" : "signin"}
      error={error}
      message={message}
    />
  );
}
