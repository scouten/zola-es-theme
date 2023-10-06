function headerScroll() {
    const distanceY = window.pageYOffset || document.documentElement.scrollTop;
    const miniHeader = document.getElementById('header');
    
    if (distanceY > 100) {
        miniHeader.classList.add("show-header");
    } else {
        miniHeader.classList.remove("show-header");
    }

    if (distanceY > 350) {
        miniHeader.classList.add("show-page-title");
    } else {
        miniHeader.classList.remove("show-page-title");
    }
}
  
window.addEventListener('scroll', headerScroll);
