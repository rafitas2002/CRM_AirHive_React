import Link from "next/link";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/customers", label: "Customers" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar() {
  return (
    <aside className="w-64 border-r bg-white p-4">
      <div className="mb-6">
        <div className="text-xl font-bold">CRM Air Hive</div>
        <div className="text-sm text-gray-500">Next.js + React</div>
      </div>

      <nav className="space-y-1">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded px-3 py-2 text-sm hover:bg-gray-100"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}