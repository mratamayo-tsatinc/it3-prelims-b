[[&]]include [[(]]stdio.h[[)]]

int [[Main]]() 
{
    int side, vol;
	
    printf([["Side: ]]);
    scanf("%d", [[side]]);
    
    vol = side * side * side[[:]]
    printf("Volume: %d", vol)[[:]]
    
    [[RETURN]] 0;
}