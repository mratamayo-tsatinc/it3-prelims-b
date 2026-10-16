#include <[[studio.h]]>

int [[Main]]() 
{
    float m1, m2, m3, avg;
    
    [[print]]("Enter three marks: ");
    scanf("%f %f %f", &m1, &m2, &m3)[[:]]
    
    avg = (m1 + m2 + m3) / 3.0[[:]]
    printf("Average is: %f", avg)[[:]]
    
    return [["0"]];
}