/**
 * The answer of the parsing prompt as a strict JSON schema (`response_format: json_schema`), for the trial of #307:
 * the fields and values `USER_ANALYZE_TRANSACTIONS` names, each required, nothing else allowed. With it the model
 * cannot answer an amount as a string or leave a field out; what a date or a category says is still its own.
 */
const SEMANTIC_TYPES = [
  'expense', 'income', 'own_transfer', 'saving_deposit', 'debt', 'reimbursement', 'cash_withdrawal', 'group_payment',
];

const ITEM_PROPERTIES = {
  intent: { type: 'string', enum: ['transaction', 'debt'] },
  amount: { type: ['number', 'null'] },
  currency: { type: 'string', enum: ['UZS', 'USD'] },
  account: { type: ['string', 'null'], enum: ['cash', 'card', null] },
  category: { type: 'string' },
  type: { type: 'string', enum: ['income', 'expense'] },
  semanticType: { type: 'string', enum: SEMANTIC_TYPES },
  needsReview: { type: 'boolean' },
  date: { type: 'string' },
  merchant: { type: ['string', 'null'] },
  confidence: { type: 'number' },
  description: { type: 'string' },
};

export const CAPTURE_ANSWER_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'capture_items',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: Object.keys(ITEM_PROPERTIES),
            properties: ITEM_PROPERTIES,
          },
        },
      },
    },
  },
} as const;
