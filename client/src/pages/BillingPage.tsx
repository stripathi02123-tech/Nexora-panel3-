import React, { useState, useEffect } from "react";
import {
  CreditCard,
  Download,
  Check,
  ArrowUp,
  ArrowDown,
  FileText,
} from "lucide-react";
import api from "@/utils/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import toast from "react-hot-toast";
import { Plan, Subscription, Invoice } from "@/types";
import { formatDate, formatBytes } from "@/utils/helpers";
const BillingPage: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pRes, sRes, iRes] = await Promise.allSettled([
          api.get("/plans"),
          api.get("/subscriptions/current"),
          api.get("/invoices"),
        ]);
        if (pRes.status === "fulfilled")
          setPlans(
            Array.isArray(pRes.value.data)
              ? pRes.value.data
              : pRes.value.data.plans || [],
          );
        if (sRes.status === "fulfilled")
          setSubscription(sRes.value.data.subscription || sRes.value.data);
        if (iRes.status === "fulfilled")
          setInvoices(
            Array.isArray(iRes.value.data)
              ? iRes.value.data
              : iRes.value.data.invoices || [],
          );
      } catch {
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);
  const handleChangePlan = async (planId: string) => {
    try {
      await api.post("/subscriptions/change", { planId });
      toast.success("Plan changed successfully");
    } catch {}
  };
  if (loading) return <LoadingSpinner size="lg" className="h-64" />;
  const currentPlan = subscription?.plan as Plan;
  const planFeatures = currentPlan?.features || plans[0]?.features || {};
  return (
    <div className="space-y-6">
      {" "}
      <div>
        {" "}
        <h1 className="text-2xl font-bold">Billing</h1>{" "}
        <p className="text-sm text-gray-500 mt-1">
          Manage your subscription and invoices
        </p>{" "}
      </div>{" "}
      {subscription && (
        <div className="glass-card p-5">
          {" "}
          <div className="flex items-center justify-between">
            {" "}
            <div>
              {" "}
              <h2 className="text-lg font-semibold">
                Current Plan: {currentPlan?.name || "Free"}
              </h2>{" "}
              <div className="flex items-center gap-3 mt-2">
                {" "}
                <StatusBadge status={subscription.status} />{" "}
                <span className="text-sm text-gray-500">
                  {" "}
                  {subscription.currentPeriodEnd &&
                    `Renews ${formatDate(subscription.currentPeriodEnd)}`}{" "}
                </span>{" "}
              </div>{" "}
            </div>{" "}
            <div className="text-right">
              {" "}
              <p className="text-2xl font-bold">
                ${currentPlan?.price || 0}
                <span className="text-sm font-normal text-gray-500">
                  /{currentPlan?.interval || "mo"}
                </span>
              </p>{" "}
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            {" "}
            {Object.entries(planFeatures).map(([key, value]) => (
              <div
                key={key}
                className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg text-center"
              >
                {" "}
                <p className="text-lg font-bold capitalize">
                  {value === -1 ? "∞" : value}
                </p>{" "}
                <p className="text-xs text-gray-500 capitalize">
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </p>{" "}
              </div>
            ))}{" "}
          </div>{" "}
        </div>
      )}{" "}
      <div className="glass-card p-5">
        {" "}
        <h2 className="text-lg font-semibold mb-4">Available Plans</h2>{" "}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {" "}
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative p-6 rounded-xl border-2 transition-all ${plan.popular ? "border-primary-500 bg-primary-50 dark:bg-primary-900/10" : "border-gray-200 dark:border-gray-700 hover:border-primary-300"}`}
            >
              {" "}
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary-600 text-white text-xs font-bold rounded-full">
                  Popular
                </span>
              )}{" "}
              <h3 className="text-lg font-bold">{plan.name}</h3>{" "}
              <p className="text-sm text-gray-500 mt-1">{plan.description}</p>{" "}
              <p className="text-3xl font-bold mt-4">
                ${plan.price}
                <span className="text-sm font-normal text-gray-500">
                  /{plan.interval}
                </span>
              </p>{" "}
              <ul className="mt-4 space-y-2">
                {" "}
                {Object.entries(plan.features ?? {}).map(([key, value]) => (
                  <li key={key} className="flex items-center gap-2 text-sm">
                    {" "}
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />{" "}
                    <span className="capitalize">
                      {key.replace(/([A-Z])/g, " $1").trim()}:{" "}
                      <strong>{value === -1 ? "Unlimited" : value}</strong>
                    </span>{" "}
                  </li>
                ))}{" "}
              </ul>{" "}
              <button
                onClick={() => handleChangePlan(plan.id)}
                disabled={
                  !!subscription &&
                  !!subscription.plan &&
                  (subscription.plan as Plan).id === plan.id
                }
                className={`w-full mt-6 py-2 rounded-lg font-medium transition-colors ${subscription && (subscription.plan as Plan)?.id === plan.id ? "bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700" : plan.popular ? "btn-primary w-full" : "btn-secondary w-full"}`}
              >
                {" "}
                {subscription && (subscription.plan as Plan)?.id === plan.id
                  ? "Current Plan"
                  : plan.price === 0
                    ? "Get Started"
                    : "Subscribe"}{" "}
              </button>{" "}
            </div>
          ))}{" "}
        </div>{" "}
      </div>{" "}
      <div className="glass-card">
        {" "}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          {" "}
          <h2 className="text-lg font-semibold">Invoices</h2>{" "}
        </div>{" "}
        {invoices.length > 0 ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {" "}
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="px-5 py-3 flex items-center justify-between"
              >
                {" "}
                <div className="flex items-center gap-3">
                  {" "}
                  <FileText className="w-4 h-4 text-gray-400" />{" "}
                  <div>
                    {" "}
                    <p className="text-sm font-medium">
                      ${inv.amount} {inv.currency}
                    </p>{" "}
                    <p className="text-xs text-gray-500">
                      {inv.description} · {formatDate(inv.createdAt)}
                    </p>{" "}
                  </div>{" "}
                </div>{" "}
                <div className="flex items-center gap-3">
                  {" "}
                  <StatusBadge status={inv.status} />{" "}
                  {inv.invoiceUrl && (
                    <a
                      href={inv.invoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost p-1.5"
                    >
                      {" "}
                      <Download className="w-4 h-4" />{" "}
                    </a>
                  )}{" "}
                </div>{" "}
              </div>
            ))}{" "}
          </div>
        ) : (
          <div className="p-5">
            <EmptyState
              icon={FileText}
              title="No invoices"
              description="Your invoices will appear here once you subscribe."
            />
          </div>
        )}{" "}
      </div>{" "}
    </div>
  );
};
export default BillingPage;
