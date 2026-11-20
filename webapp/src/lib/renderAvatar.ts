export function renderAvatar(container: HTMLElement, name: string, photo: unknown) {
  const initial = name.charAt(0).toUpperCase();
  if (typeof photo !== "string" || !photo) {
    container.textContent = initial;
    return;
  }
  const image = document.createElement("img");
  image.className = "w-full h-full rounded-full object-cover";
  image.referrerPolicy = "no-referrer";
  image.alt = "";
  image.addEventListener("error", () => { container.textContent = initial; });
  image.src = photo;
  container.replaceChildren(image);
}
