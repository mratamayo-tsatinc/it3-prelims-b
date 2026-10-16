#[[Include]] <stdio.h>

int [[Main]]() 
{
    int balance = 1000;
    int withdraw;
    
    printf("Current Balance: %d\n", balance)[[,]]
    printf("Enter amount to withdraw: ")[[,]]
    scanf("%d", [[withdraw]]);
    
    balance = balance - withdraw[[,]]
    printf("New balance: %d\n", balance)[[,]]
    
    [[Return]] 0;
}