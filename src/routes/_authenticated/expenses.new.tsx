import { createFileRoute, useNavigate } from "@tanstack/react-router";
import ExpenseForm from "@/components/expenses/ExpenseForm";

export const Route = createFileRoute("/_authenticated/expenses/new")({
  component: NewExpensePage,
});

function NewExpensePage() {
  const nav = useNavigate();
  return <ExpenseForm onDone={() => nav({ to: "/expenses" })} />;
}
