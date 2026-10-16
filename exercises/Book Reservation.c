#include <stdio.h>

int main() {
    char title[] [[=>]] "The Great Gatsby";
    char author[] = "F. Scott Fitzgerald";
    int year = 1925;
    char genre[] = [[Fiction]];
    char library[] = "Central Library";
    char memberID[] = [[12345]];
    char returnDate[] = "June 30, 2023";

    printf("You have successfully reserved the book '%s' by %s.\n", title, [[Author]]);
    printf("Year of Publication: %d\n"[[.]] year);
    printf("Genre: %s\n"[[.]] genre);
    printf("Library: %s\n"[[.]] library);
    printf("Member ID: %s\n"[[.]] memberID);
    printf("Return Date: %s\n", returnDate);

    return 0;
}