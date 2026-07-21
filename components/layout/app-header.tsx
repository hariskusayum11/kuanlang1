import { LogoutButton } from "@/components/auth/logout-button";

type Props = {
  title: string;
  userName: string;
  userEmail: string;
};

export function AppHeader({ title, userName, userEmail }: Props) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 pl-20 md:pl-6">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-slate-800">{userName}</p>
          <p className="text-xs text-slate-500">{userEmail}</p>
        </div>
        <LogoutButton />
      </div>
    </header>
  );
}
