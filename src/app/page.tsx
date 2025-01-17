import Link from "next/link";

export default function Page() {
  return (
    <ul className="mx-8 my-4 list-disc text-blue-500 underline">
      <li><Link href="/jaq/" prefetch>jaq</Link></li>
      <li><Link href="/duckdb/" prefetch>duckdb</Link></li>
      <li><Link href="/sqlite3/" prefetch>sqlite3</Link></li>
    </ul>
  );
}
