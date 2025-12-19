import { useState } from "react";
import { type Trip, type IExpense } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Trash2, Plus } from "lucide-react";

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
    const totalSpent = expenses.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const budget = trip.budget || 0;
    const remaining = budget - totalSpent;

    // Prepare Chart Data
    const chartData = CATEGORIES.map(cat => {
        const value = expenses.filter(e => e.category === cat).reduce((acc, curr) => acc + Number(curr.amount), 0);
        return { name: cat, value };
    }).filter(d => d.value > 0);

    const handleAdd = async () => {
        if (!newExpense.amount || !newExpense.description) return;

        try {
            await apiRequest('POST', `/api/v1/trips/${trip._id}/expenses`, {
                ...newExpense,
                date: new Date(),
            });
            queryClient.invalidateQueries({ queryKey: [`/api/v1/trips/${trip._id}`] }); // Invalidate specific trip
            queryClient.invalidateQueries({ queryKey: ['/api/v1/trips'] }); // Invalidate list just in case
            setIsAdding(false);
            setNewExpense({ amount: 0, currency: trip.currency || "INR", category: "Food", description: "" });
        } catch (error) {
            console.error("Failed to add expense", error);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await apiRequest('DELETE', `/api/v1/trips/${trip._id}/expenses/${id}`);
            queryClient.invalidateQueries({ queryKey: [`/api/v1/trips/${trip._id}`] });
            queryClient.invalidateQueries({ queryKey: ['/api/v1/trips'] });
        } catch (error) {
            console.error("Failed to delete expense", error);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Summary Card */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-white">Budget Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex justify-between mb-4 text-white">
                            <div>
                                <p className="text-sm text-ios-gray">Total Budget</p>
                                <p className="text-2xl font-bold">{trip.currency} {budget.toLocaleString()}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-ios-gray">Spent</p>
                                <p className="text-2xl font-bold text-ios-blue">{trip.currency} {totalSpent.toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="w-full bg-secondary h-4 rounded-full overflow-hidden">
                            <div
                                className={`h-full ${remaining < 0 ? 'bg-red-500' : 'bg-ios-green'}`}
                                style={{ width: `${Math.min((totalSpent / (budget || 1)) * 100, 100)}%` }}
                            />
                        </div>
                        <p className={`text-right mt-2 text-sm ${remaining < 0 ? 'text-red-500' : 'text-ios-green'}`}>
                            {remaining < 0 ? `Over budget by ${Math.abs(remaining).toLocaleString()}` : `${remaining.toLocaleString()} remaining`}
                        </p>
                    </CardContent>
                </Card>

                {/* Chart Card */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-white">Spending Breakdown</CardTitle>
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
                                        contentStyle={{ backgroundColor: '#1c1c1e', border: 'none', borderRadius: '8px' }}
                                        itemStyle={{ color: '#fff' }}
                                    />
                                    <Legend layout="vertical" align="right" verticalAlign="middle" />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-ios-gray">
                                No expenses logged yet.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Expense List & Add Form */}
            <Card className="bg-card border-border">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-white">Expenses</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => setIsAdding(!isAdding)}>
                        <Plus className="w-4 h-4 mr-2" /> Add Expense
                    </Button>
                </CardHeader>
                <CardContent>
                    {isAdding && (
                        <div className="mb-4 p-4 bg-secondary rounded-lg grid gap-4 md:grid-cols-4 items-end">
                            <div>
                                <label className="text-xs text-ios-gray mb-1 block">Description</label>
                                <Input
                                    value={newExpense.description}
                                    onChange={e => setNewExpense({ ...newExpense, description: e.target.value })}
                                    placeholder="Lunch, Taxi, etc."
                                    className="bg-background border-border text-white"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-ios-gray mb-1 block">Amount</label>
                                <Input
                                    type="number"
                                    value={newExpense.amount}
                                    onChange={e => setNewExpense({ ...newExpense, amount: Number(e.target.value) })}
                                    className="bg-background border-border text-white"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-ios-gray mb-1 block">Category</label>
                                <Select
                                    value={newExpense.category}
                                    onValueChange={(val: any) => setNewExpense({ ...newExpense, category: val })}
                                >
                                    <SelectTrigger className="bg-background border-border text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button onClick={handleAdd} className="bg-ios-blue hover:bg-ios-blue/90">Save</Button>
                        </div>
                    )}

                    <div className="space-y-2">
                        {expenses.length === 0 && !isAdding && (
                            <div className="text-center text-ios-gray py-4">No expenses recorded.</div>
                        )}
                        {expenses.map((expense) => (
                            <div key={expense.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-ios-blue/10 flex items-center justify-center text-ios-blue">
                                        <i className={`fas fa-${expense.category === 'Food' ? 'utensils' : expense.category === 'Transport' ? 'car' : 'tag'}`}></i>
                                    </div>
                                    <div>
                                        <div className="font-medium text-white">{expense.description}</div>
                                        <div className="text-xs text-ios-gray">{expense.category} • {new Date(expense.date).toLocaleDateString()}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="font-bold text-white">{expense.currency} {expense.amount}</div>
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
