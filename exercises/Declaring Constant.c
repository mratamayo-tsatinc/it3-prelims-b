#include <stdio.h>

int main() 
{
    [[constant]] float PI = 3.14159[[:]]
    float radius = 5.0;
    float area = PI * radius * radius;

    return 0;
}