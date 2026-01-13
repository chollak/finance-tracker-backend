import React, { useState, useEffect } from 'react';
import { Transaction } from '../types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface EditTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Transaction>) => Promise<boolean>;
  transaction: Transaction | null;
}

export default function EditTransactionModal({
  isOpen,
  onClose,
  onSave,
  transaction
}: EditTransactionModalProps) {
  const [formData, setFormData] = useState({
    amount: '',
    category: '',
    description: '',
    date: '',
    type: 'expense' as 'income' | 'expense'
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (transaction) {
      setFormData({
        amount: transaction.amount.toString(),
        category: transaction.category,
        description: transaction.description,
        date: transaction.date,
        type: transaction.type
      });
    }
  }, [transaction]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction?.id) return;

    setIsSaving(true);

    const updates: Partial<Transaction> = {};

    // Only include fields that have changed
    if (parseFloat(formData.amount) !== transaction.amount) {
      updates.amount = parseFloat(formData.amount);
    }
    if (formData.category !== transaction.category) {
      updates.category = formData.category;
    }
    if (formData.description !== transaction.description) {
      updates.description = formData.description;
    }
    if (formData.date !== transaction.date) {
      updates.date = formData.date;
    }
    if (formData.type !== transaction.type) {
      updates.type = formData.type;
    }

    // Check if there are any changes
    if (Object.keys(updates).length === 0) {
      setIsSaving(false);
      onClose();
      return;
    }

    const success = await onSave(updates);
    setIsSaving(false);

    if (success) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Transaction</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value as 'income' | 'expense' })}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="income">Income</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
