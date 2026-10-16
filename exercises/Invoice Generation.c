#include <stdio.h>

int main() {
    [[Char]] name[] = "John Doe";
    [[Int]] id = 12345;
    [[Float]] amount = 99.99;

    [[Printf]]("Invoice for Customer: %s\nOrder ID: %d\nTotal Amount: $%.2f", name, id, [[Amount]]);

    [[Return]] 0;
}