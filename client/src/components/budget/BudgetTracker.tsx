import { useState, useRef } from "react";
import type { Trip } from "@/types/api.types";
import { type IExpense } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { useTripStore } from "@/store";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Trash2, Plus, AlertTriangle, TrendingUp, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

interface BudgetTrackerProps {
    trip: Trip;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ff7300'];

const CATEGORIES = ["Accommodation", "Food", "Transport", "Activities", "Shopping", "Other"];

export function BudgetTracker({ trip }: BudgetTrackerProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newExpense, setNewExpense] = useState<Partial<IExpense>>({
        amount: 0,
        currency: trip.currency || "INR",
        category: "Food",
        description: "",
    });

    const expenses = trip.expenses || [];

    const { data: forecast, isLoading: forecasting } = useQuery<any>({
        queryKey: [`/api/v1/trips/${trip.id}/budget-forecast`],
        enabled: !!trip.id,
    });

    // Calculate AI-generated itinerary costs
    let itineraryCost = 0;
    if (Array.isArray(trip.itinerary)) {
        trip.itinerary.forEach((day: any) => {
            if (Array.isArray(day.activities)) {
                day.activities.forEach((act: any) => {
                    itineraryCost += (Number(act.cost) || 0);
                });
            }
        });
    }

    const manualSpent = expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const grandTransit = Number(trip.budgetBreakdown?.grandTransit || 0);
    const totalSpent = manualSpent + itineraryCost + grandTransit;
    const budget = trip.budget || 0;
    const remaining = budget - totalSpent;

    // Prepare Chart Data
    // We add an "AI Itinerary" slice to the pie chart to represent the planned activities
    const chartData = CATEGORIES.map(cat => {
        let value = expenses.filter(e => e.category === cat).reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

        // If the category is Activities, include the AI itinerary cost
        if (cat === "Activities" && itineraryCost > 0) {
            value += itineraryCost;
        }

        return { name: cat, value };
    }).filter(d => d.value > 0);

    if (grandTransit > 0) {
        chartData.push({ name: "Transit to Destination", value: grandTransit });
    }

    const handleAdd = async () => {
        if (!newExpense.amount || !newExpense.description) return;

        try {
            await apiRequest('POST', `/api/v1/trips/${trip.id}/expenses`, {
                ...newExpense,
                date: new Date(),
            });
            useTripStore.getState().fetchTrip(trip.id!);
            setIsAdding(false);
            setNewExpense({ amount: 0, currency: trip.currency || "INR", category: "Food", description: "" });
        } catch (error) {
            console.error("Failed to add expense", error);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await apiRequest('DELETE', `/api/v1/trips/${trip.id}/expenses/${id}`);
            useTripStore.getState().fetchTrip(trip.id!);
        } catch (error) {
            console.error("Failed to delete expense", error);
        }
    };

    return (
        <div className="space-y-6">
            {/* AI Burn Rate Alert */}
            <AnimatePresence>
                {forecast?.burnRate > 1 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                    >
                        <Card className="bg-red-500/10 border-red-500/20 overflow-hidden">
                            <CardContent className="p-4 flex items-start gap-3">
                                <div className="p-2 bg-red-500/20 rounded-full text-red-500">
                                    <AlertTriangle className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-red-500">High Burn Rate Detected</h4>
                                        <Badge variant="outline" className="text-red-500 border-red-500/50 bg-red-500/10">
                                            {Math.round((forecast.burnRate - 1) * 100)}% Over Target
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-red-200/70 mt-1">
                                        Your current spending pace exceeds your proportional daily budget. 
                                        {forecast.alerts?.[0] || "We recommend reviewing your upcoming planned expenses."}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Summary Card */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-foreground">Budget Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex justify-between mb-4 text-foreground">
                            <div>
                                <p className="text-sm text-muted-foreground">Total Budget</p>
                                <p className="text-2xl font-bold">{trip.currency || 'INR'} {budget.toLocaleString()}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-muted-foreground">Spent</p>
                                <p className="text-2xl font-bold text-[#1D4E89] dark:text-blue-400">{trip.currency || 'INR'} {totalSpent.toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="w-full bg-secondary h-4 rounded-full overflow-hidden">
                            <div
                                className={`h-full ${remaining < 0 ? 'bg-red-500' : 'bg-emerald-600'}`}
                                style={{ width: `${Math.min((totalSpent / (budget || 1)) * 100, 100)}%` }}
                            />
                        </div>
                        <p className={`text-right mt-2 text-sm ${remaining < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {remaining < 0 ? `Over budget by ${Math.abs(remaining).toLocaleString()}` : `${remaining.toLocaleString()} remaining`}
                        </p>
                    </CardContent>
                </Card>

                {/* Chart Card */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-foreground">Spending Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[200px]">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={chartData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                                        itemStyle={{ color: '#fff' }}
                                    />
                                    <Legend layout="vertical" align="right" verticalAlign="middle" />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                No expenses logged yet.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* AI Insights & Pivots */}
            <AnimatePresence>
                {forecast?.pivots?.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <Card className="bg-[#1D4E89]/5 border-[#1D4E89]/20">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                                    <Lightbulb className="w-4 h-4 text-[#1D4E89] dark:text-blue-400" />
                                    AI Smart Pivots
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {forecast.pivots.map((pivot: string, i: number) => (
                                        <div key={i} className="flex gap-3 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg border border-border/50">
                                            <div className="text-[#1D4E89] dark:text-blue-400 font-bold">#{(i + 1)}</div>
                                            <div>{pivot}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 flex items-center justify-between text-xs pt-4 border-t border-border/50">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <TrendingUp className="w-4 h-4" />
                                        Est. Final Cost: <span className="text-foreground font-bold">{trip.currency || 'INR'} {forecast?.estimatedFinalCost?.toLocaleString()}</span>
                                    </div>
                                    <div className="text-[#1D4E89] dark:text-blue-400 flex items-center gap-1">
                                        <i className="fas fa-robot"></i> AI Forecast
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Expense List & Add Form */}
            <Card className="bg-card border-border">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-foreground">Expenses</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => setIsAdding(!isAdding)}>
                        <Plus className="w-4 h-4 mr-2" /> Add Expense
                    </Button>
                </CardHeader>
                <CardContent>
                    {isAdding && (
                        <div className="mb-4 p-4 bg-secondary rounded-lg grid gap-4 md:grid-cols-4 items-end">
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                                <Input
                                    value={newExpense.description}
                                    onChange={e => setNewExpense({ ...newExpense, description: e.target.value })}
                                    placeholder="Lunch, Taxi, etc."
                                    className="bg-background border-border text-foreground"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Amount</label>
                                <Input
                                    type="number"
                                    value={newExpense.amount}
                                    onChange={e => setNewExpense({ ...newExpense, amount: Number(e.target.value) })}
                                    className="bg-background border-border text-foreground"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                                <Select
                                    value={newExpense.category}
                                    onValueChange={(val: any) => setNewExpense({ ...newExpense, category: val })}
                                >
                                    <SelectTrigger className="bg-background border-border text-foreground">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button onClick={handleAdd} className="bg-[#1D4E89] hover:bg-[#1D4E89]/90">Save</Button>
                        </div>
                    )}

                    <div className="space-y-2">
                        {expenses.length === 0 && !isAdding && (
                            <div className="text-center text-muted-foreground py-4">No expenses recorded.</div>
                        )}
                        {expenses.map((expense) => (
                            <div key={expense.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-[#1D4E89]/10 flex items-center justify-center text-[#1D4E89] dark:text-blue-400">
                                        <i className={`fas fa-${expense.category === 'Food' ? 'utensils' : expense.category === 'Transport' ? 'car' : 'tag'}`}></i>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium text-foreground truncate">{expense.description}</div>
                                        <div className="text-xs text-muted-foreground">{expense.category} • {new Date(expense.date).toLocaleDateString()}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="font-bold text-foreground">{expense.currency} {expense.amount}</div>
                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(expense.id)} className="text-red-500 hover:text-red-400 hover:bg-red-500/10 h-8 w-8">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
