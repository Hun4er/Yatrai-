import fs from 'fs';

const filePath = 'server/src/services/rail/alternativesEngine.service.js';
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

const target = `          departureTime: t2Dep,
          arrivalTime: t2Arr,
          departureTimeFormatted: t2Dep,
          arrivalTimeFormatted: t2Arr,`;

const replacement = `          departureTime: this._toIso(t2Dep, t2DateStr) || t2Dep,
          arrivalTime: this._toIso(t2Arr, timing2.arrivalLocalDate || t2DateStr) || t2Arr,
          departureTimeFormatted: t2Dep,
          arrivalTimeFormatted: t2Arr,`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully updated Leg 2 dates to ISO');
} else {
  console.error('Target not found in alternativesEngine');
}

