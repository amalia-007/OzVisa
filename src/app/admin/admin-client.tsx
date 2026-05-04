"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Lock,
  TrendingUp,
  Users,
  DollarSign,
  BarChart3,
  Eye,
  Loader2,
  LogOut,
} from "lucide-react";

interface AnalysisRecord {
  id: string;
  email: string;
  visa_type: "417" | "462";
  stripe_status: string;
  language: string;
  created_at: string;
  payment_intent_id: string | null;
}

interface Stats {
  totalRevenue: number;
  totalAnalyses: number;
  paidAnalyses: number;
  conversionRate: number;
}

interface AdminData {
  analyses: AnalysisRecord[];
  stats: Stats;
}

interface AdminClientProps {
  locale: string;
}

export function AdminClient({ locale }: AdminClientProps) {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminData | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const isFrench = locale === "fr";

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin", {
        headers: { Authorization: `Bearer ${password}` },
      });

      if (!res.ok) {
        setError(isFrench ? "Mot de passe incorrect" : "Incorrect password");
        return;
      }

      const adminData: AdminData = await res.json();
      setData(adminData);
      setIsLoggedIn(true);
    } catch {
      setError(isFrench ? "Erreur de connexion" : "Connection error");
    } finally {
      setIsLoading(false);
    }
  }

  function handleLogout() {
    setIsLoggedIn(false);
    setData(null);
    setPassword("");
    setViewingId(null);
  }

  function getStatusBadge(status: string) {
    const variants: Record<string, { variant: "success" | "warning" | "destructive" | "secondary"; label: string }> = {
      completed: { variant: "success", label: "Completed" },
      paid: { variant: "success", label: "Paid" },
      pending: { variant: "secondary", label: "Pending" },
      analysis_failed: { variant: "destructive", label: "Failed" },
    };
    const { variant, label } = variants[status] || { variant: "secondary" as const, label: status };
    return <Badge variant={variant}>{label}</Badge>;
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <Lock className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle>{isFrench ? "Accès Admin" : "Admin Access"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isFrench ? "Mot de passe admin" : "Admin password"}
                  className={error ? "border-red-400" : ""}
                />
                {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  isFrench ? "Connexion" : "Login"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { stats, analyses } = data!;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🦘</span>
          <h1 className="text-xl font-bold text-gray-900">
            {isFrench ? "Dashboard Admin" : "Admin Dashboard"}
          </h1>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
          <LogOut className="h-4 w-4" />
          {isFrench ? "Déconnexion" : "Logout"}
        </Button>
      </div>

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<DollarSign className="h-5 w-5 text-green-600" />}
            label={isFrench ? "Revenus totaux" : "Total revenue"}
            value={`A$${stats.totalRevenue}`}
            bg="bg-green-50"
          />
          <StatCard
            icon={<Users className="h-5 w-5 text-blue-600" />}
            label={isFrench ? "Analyses totales" : "Total analyses"}
            value={stats.totalAnalyses.toString()}
            bg="bg-blue-50"
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5 text-purple-600" />}
            label={isFrench ? "Analyses payées" : "Paid analyses"}
            value={stats.paidAnalyses.toString()}
            bg="bg-purple-50"
          />
          <StatCard
            icon={<BarChart3 className="h-5 w-5 text-orange-600" />}
            label={isFrench ? "Taux de conversion" : "Conversion rate"}
            value={`${stats.conversionRate}%`}
            bg="bg-orange-50"
          />
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {isFrench ? "Toutes les analyses" : "All analyses"} ({analyses.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {["Email", isFrench ? "Date" : "Date", isFrench ? "Visa" : "Visa", "Status", "Lang", isFrench ? "Actions" : "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {analyses.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-900">{row.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(row.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">WHV {row.visa_type}</Badge>
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(row.stripe_status)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 uppercase">{row.language}</td>
                      <td className="px-4 py-3">
                        {row.stripe_status === "completed" && (
                          <a
                            href={`/results?id=${row.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="ghost" size="sm" className="gap-1.5">
                              <Eye className="h-3.5 w-3.5" />
                              {isFrench ? "Voir" : "View"}
                            </Button>
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {analyses.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  {isFrench ? "Aucune analyse pour l'instant." : "No analyses yet."}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bg: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${bg}`}>{icon}</div>
          <div>
            <p className="text-xs text-gray-500 font-medium">{label}</p>
            <p className="text-xl font-bold text-gray-900">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
