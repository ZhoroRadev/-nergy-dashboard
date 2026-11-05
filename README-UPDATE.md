# Обновяване до v2: Производство на ЕСО

Съдържанието на този архив е **допълнение**, не пълно хранилище. Качи файловете със запазена структура в GitHub. `index.html` и `assets/app.js` се заменят; `scripts/collect_generation.py` и `.github/workflows/eso-generation.yml` са нови.

**Не изтривай и не заменяй** работещия `scripts/collect_eso.py`, `data/eso.json` и `.github/workflows/eso-collector.yml`.

Пусни `Actions → Collect ESO generation → Run workflow`. При успешен парсер ще се появи `data/eso-generation.json`, а сайтът ще покаже категории в раздела ЕСО. При непознат JSON парсерът прекъсва, без да публикува числа. В този случай отвори суровия отговор от `https://www.eso.bg/api/rabota_na_EEC_json.php` и адаптирай схемата; не изключвай проверките.

В тази среда не е получен живият отговор от ЕСО, затова работата с реалния формат не е потвърдена.
