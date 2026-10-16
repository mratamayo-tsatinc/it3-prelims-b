#[[includ]] <[[studio.h]]>

int main() {
    [[Char]] name[50];
    [[Int]] age;
    [[Char]] city[50];

    printf("Enter your name: ");
    scanf("%s", name);
	
    printf("Enter your age: ");
    scanf("%d", [[age]]);
	
    printf("Enter your city: ");
    [[Scanf]]("%s", city);

    printf("Name: %s \nAge: %d \nCity: %s\n", name, age, city)[[:]]

    return 0;
}