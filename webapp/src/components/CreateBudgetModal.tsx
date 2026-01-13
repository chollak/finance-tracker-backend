import React, { useState } from 'react';
import { BudgetPeriod } from '../types';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';

interface CreateBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (budgetData: {
    name: string;
    amount: number;
    period: BudgetPeriod;
    startDate: string;
    endDate: string;
    categoryIds?: string[];
    description?: string;
  }) => void;
  loading?: boolean;
}

const CreateBudgetModal: React.FC<CreateBudgetModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  loading = false
}) => {
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    period: BudgetPeriod.MONTHLY,
    startDate: '',
    endDate: '',
    description: '',
    categoryIds: [] as string[]
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Common categories for selection
  const commonCategories = [
    'Food', 'Transportation', 'Entertainment', 'Shopping', 'Utilities',
    'Healthcare', 'Education', 'Travel', 'Subscriptions', 'Other'
  ];

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Budget name is required';
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }

    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required';
    }

    if (!formData.endDate) {
      newErrors.endDate = 'End date is required';
    }

    if (formData.startDate && formData.endDate && formData.startDate >= formData.endDate) {
      newErrors.endDate = 'End date must be after start date';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (validateForm()) {
      onSubmit({
        name: formData.name,
        amount: parseFloat(formData.amount),
        period: formData.period,
        startDate: formData.startDate,
        endDate: formData.endDate,
        categoryIds: formData.categoryIds.length > 0 ? formData.categoryIds : undefined,
        description: formData.description || undefined
      });
    }
  };

  const handleCategoryToggle = (category: string) => {
    setFormData(prev => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(category)
        ? prev.categoryIds.filter(c => c !== category)
        : [...prev.categoryIds, category]
    }));
  };

  const generateEndDate = (start: string, period: BudgetPeriod) => {
    if (!start) return '';

    const startDate = new Date(start);
    let endDate = new Date(startDate);

    switch (period) {
      case BudgetPeriod.WEEKLY:
        endDate.setDate(startDate.getDate() + 7);
        break;
      case BudgetPeriod.MONTHLY:
        endDate.setMonth(startDate.getMonth() + 1);
        break;
      case BudgetPeriod.QUARTERLY:
        endDate.setMonth(startDate.getMonth() + 3);
        break;
      case BudgetPeriod.YEARLY:
        endDate.setFullYear(startDate.getFullYear() + 1);
        break;
    }

    return endDate.toISOString().split('T')[0];
  };

  const handlePeriodChange = (period: BudgetPeriod) => {
    setFormData(prev => ({
      ...prev,
      period,
      endDate: generateEndDate(prev.startDate, period)
    }));
  };

  const handleStartDateChange = (startDate: string) => {
    setFormData(prev => ({
      ...prev,
      startDate,
      endDate: generateEndDate(startDate, prev.period)
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Budget</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Budget Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Budget Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Monthly Food Budget"
              disabled={loading}
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">
              Budget Amount ($) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
              placeholder="500.00"
              disabled={loading}
              className={errors.amount ? 'border-destructive' : ''}
            />
            {errors.amount && <p className="text-sm text-destructive">{errors.amount}</p>}
          </div>

          {/* Period */}
          <div className="space-y-2">
            <Label htmlFor="period">
              Budget Period <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.period}
              onValueChange={(value) => handlePeriodChange(value as BudgetPeriod)}
              disabled={loading}
            >
              <SelectTrigger id="period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BudgetPeriod.WEEKLY}>Weekly</SelectItem>
                <SelectItem value={BudgetPeriod.MONTHLY}>Monthly</SelectItem>
                <SelectItem value={BudgetPeriod.QUARTERLY}>Quarterly</SelectItem>
                <SelectItem value={BudgetPeriod.YEARLY}>Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">
                Start Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                disabled={loading}
                className={errors.startDate ? 'border-destructive' : ''}
              />
              {errors.startDate && <p className="text-sm text-destructive">{errors.startDate}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">
                End Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="endDate"
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                disabled={loading}
                className={errors.endDate ? 'border-destructive' : ''}
              />
              {errors.endDate && <p className="text-sm text-destructive">{errors.endDate}</p>}
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-2">
            <Label>Categories (optional)</Label>
            <p className="text-sm text-muted-foreground mb-2">
              Select categories to track specific spending areas
            </p>
            <div className="flex flex-wrap gap-2">
              {commonCategories.map(category => (
                <Button
                  key={category}
                  type="button"
                  variant={formData.categoryIds.includes(category) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleCategoryToggle(category)}
                  disabled={loading}
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Add notes about this budget..."
              rows={3}
              disabled={loading}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Budget'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateBudgetModal;
