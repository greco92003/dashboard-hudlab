// Test script to debug Supabase query directly
// This will help us understand if the issue is in the query logic

const formatDateToLocal = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

console.log("=== Supabase Query Debug ===");
console.log("Today:", formatDateToLocal(new Date()));
console.log();

// Test the exact date calculation logic for each period
const testPeriods = [30, 60, 90];

testPeriods.forEach(period => {
  console.log(`=== Testing period: ${period} days ===`);
  
  // Replicate the exact API logic
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);

  const startDate = new Date();
  let monthsToSubtract = 1;
  if (period === 60) monthsToSubtract = 2;
  else if (period === 90) monthsToSubtract = 3;

  startDate.setMonth(startDate.getMonth() - monthsToSubtract);
  startDate.setHours(0, 0, 0, 0);
  
  const startDateForQuery = formatDateToLocal(startDate);
  const endDateForQuery = formatDateToLocal(endDate);
  
  console.log("Query parameters:");
  console.log("  startDate:", startDateForQuery);
  console.log("  endDate:", endDateForQuery);
  console.log("  monthsToSubtract:", monthsToSubtract);
  
  // Simulate the Supabase query conditions
  console.log("SQL equivalent:");
  console.log(`  WHERE sync_status = 'synced'`);
  console.log(`    AND closing_date IS NOT NULL`);
  console.log(`    AND closing_date >= '${startDateForQuery}'`);
  console.log(`    AND closing_date <= '${endDateForQuery}'`);
  console.log(`  ORDER BY closing_date DESC`);
  console.log();
});

// Test specific edge case for July 29
console.log("=== Specific test for July 29, 2025 ===");
const july29 = new Date(2025, 6, 29); // July 29, 2025

// Test 30-day period
const endDateJuly29 = new Date(july29);
endDateJuly29.setHours(23, 59, 59, 999);

const startDateJuly29 = new Date(july29);
startDateJuly29.setMonth(startDateJuly29.getMonth() - 1);
startDateJuly29.setHours(0, 0, 0, 0);

const startDateJuly29Str = formatDateToLocal(startDateJuly29);
const endDateJuly29Str = formatDateToLocal(endDateJuly29);

console.log("30-day period for July 29:");
console.log("  startDate:", startDateJuly29Str);
console.log("  endDate:", endDateJuly29Str);

// Test if specific dates would be included
const testDates = [
  "2025-06-29", // Start date
  "2025-07-01", // Beginning of July
  "2025-07-15", // Middle of July
  "2025-07-28", // Yesterday
  "2025-07-29", // Today
];

console.log("\nDate inclusion test:");
testDates.forEach(testDate => {
  const isIncluded = testDate >= startDateJuly29Str && testDate <= endDateJuly29Str;
  console.log(`  ${testDate}: ${isIncluded ? "✅ INCLUDED" : "❌ EXCLUDED"}`);
});

// Compare with 60-day period
console.log("\n=== Comparison with 60-day period ===");
const startDate60 = new Date(july29);
startDate60.setMonth(startDate60.getMonth() - 2);
startDate60.setHours(0, 0, 0, 0);

const startDate60Str = formatDateToLocal(startDate60);

console.log("60-day period for July 29:");
console.log("  startDate:", startDate60Str);
console.log("  endDate:", endDateJuly29Str);

console.log("\nDate inclusion test for 60-day:");
testDates.forEach(testDate => {
  const isIncluded = testDate >= startDate60Str && testDate <= endDateJuly29Str;
  console.log(`  ${testDate}: ${isIncluded ? "✅ INCLUDED" : "❌ EXCLUDED"}`);
});

console.log("\n=== Summary ===");
console.log("If the date calculations are correct but data isn't showing,");
console.log("the issue might be:");
console.log("1. Data format in Supabase (closing_date format)");
console.log("2. Timezone issues in the database");
console.log("3. Index or performance issues");
console.log("4. Data sync issues for recent dates");
console.log("5. Different data in the database for different date ranges");
