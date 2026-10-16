[[&]]include <stdio.h>

int main[[;]] 
[[}]]
    [[Double]] price, discount, total;
    
    printf("Price: ");
    scanf("%lf", &[[Price]]);
    
    discount = [[Price]] * 0.10;
    total = [[Price]] - discount;
    
    printf("Final Price: %.2lf", total);
	
    return [["0"]];
}