const crypto = require('crypto');

const secret = 'brZA6Gp0H4Y8lkF2CLNtEh26mdw';
const stringToSign = 'folder=profile-photos&public_id=user-69a02b3fbcaa24c1caa20514-1772190818104&timestamp=1772190818';

const signature = crypto.createHash('sha1').update(stringToSign + secret).digest('hex');

console.log('Parameters String:', stringToSign);
console.log('Secret:', secret);
console.log('Calculated Signature:', signature);
console.log('Expected Signature:', '17a9ab7e159769c2b76cb24dfa69193e37ca9f83');

if (signature === '17a9ab7e159769c2b76cb24dfa69193e37ca9f83') {
    console.log('MATCH!');
} else {
    console.log('NO MATCH');
}

// Test common typos
const variations = [
    secret.replace('l', 'I'),
    secret.replace('l', '1'),
    secret.replace('0', 'O'),
    secret.replace('O', 'Q'),
    secret.trim()
];

variations.forEach(v => {
    const s = crypto.createHash('sha1').update(stringToSign + v).digest('hex');
    if (s === '17a9ab7e159769c2b76cb24dfa69193e37ca9f83') {
        console.log('FOUND TYPO VARIATION MATCH:', v);
    }
});
