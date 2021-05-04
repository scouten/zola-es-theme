function headerScroll() {
    const distanceY = window.pageYOffset || document.documentElement.scrollTop;
    const miniHeader = document.getElementById('header');
    
    if (distanceY > 200) {
        miniHeader.classList.add("show-title");
    } else {
        miniHeader.classList.remove("show-title");
    }

    if (distanceY > 20) {
        miniHeader.classList.add("hide-name");
    } else {
        miniHeader.classList.remove("hide-name");
    }
}
  
window.addEventListener('scroll', headerScroll);
