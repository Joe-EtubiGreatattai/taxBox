// Nigerian Tax Rates based on categories
const NIGERIAN_TAX_RATES = {
  business: {
    rate: 0.075,
    name: 'VAT',
    deductible: true
  },
  goods: {
    rate: 0.075,
    name: 'VAT',
    deductible: false
  },
  services: {
    rate: 0.075,
    name: 'VAT',
    deductible: false
  },
  medical: {
    rate: 0,
    name: 'Exempt',
    deductible: true
  },
  education: {
    rate: 0,
    name: 'Exempt',
    deductible: true
  },
  food: {
    rate: 0.075,
    name: 'VAT',
    deductible: false
  },
  transport: {
    rate: 0.075,
    name: 'VAT',
    deductible: false
  },
  entertainment: {
    rate: 0.075,
    name: 'VAT',
    deductible: false
  },
  other: {
    rate: 0.075,
    name: 'VAT',
    deductible: false
  }
};

module.exports = NIGERIAN_TAX_RATES;