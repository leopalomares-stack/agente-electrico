// npm i se ejecutará en Render; aquí solo pegamos el código.
import express from "express";
import axios from "axios";
import cors from "cors";
import ExcelJS from "exceljs";

const app = express();
app.use(cors());
app.use(express.json());

// === 1) BUSCAR PRODUCTOS EN INTERNET (3 opciones) ===
// Busca en Amazon MX, Home Depot MX, MercadoLibre MX, Walmart MX, Elektron MX.
// Nota: Esto usa un scraping MUY básico de Google. En producción conviene usar una API de búsqueda (SerpAPI/Bing).
app.post("/webProductSearch", async (req, res) => {
  const { query, max = 5 } = req.body;
  const q = encodeURIComponent(
    query +
      " site:amazon.com.mx OR site:homedepot.com.mx OR site:mercadolibre.com.mx OR site:walmart.com.mx OR site:elektron.com.mx"
  );
  try {
    const response = await axios.get(`https://www.google.com/search?q=${q}&num=${max}`, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const html = response.data;
    // Extrae enlaces básicos del HTML de resultados
    const matches = [...html.matchAll(/<a href="(https?:\/\/[^"]+)".*?>(.*?)<\/a>/g)];

    const items = [];
    for (let i = 0; i < matches.length && items.length < 3; i++) {
      const url = matches[i][1];
      if (!url.includes("google") && !url.includes("/search?")) {
        const title = matches[i][2].replace(/<[^>]+>/g, "").trim();
        items.push({
          brand:
            /iusa|viakon|condumex|siemens|bticino|weg|schneider|philips|voltech/i.exec(title)?.[0] ||
            "Marca no identificada",
          product: title.slice(0, 160),
          price: "Consultar en enlace",
          store: url.includes("amazon")
            ? "Amazon MX"
            : url.includes("homedepot")
            ? "Home Depot MX"
            : url.includes("mercadolibre")
            ? "MercadoLibre MX"
            : url.includes("walmart")
            ? "Walmart MX"
            : url.includes("elektron")
            ? "Elektron MX"
            : "Tienda en línea",
          url
        });
      }
    }

    res.json({ query, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// === 2) PRODUCTOS COMPLEMENTARIOS (ligas genéricas útiles) ===
app.post("/webComplements", async (req, res) => {
  const { base_query } = req.body;
  const lower = (base_query || "").toLowerCase();
  const out = [];
  const push = (name, note, link) => out.push({ name, note, link });

  if (/cable/.test(lower)) {
    push("Conectores tipo Wago", "Empalmes rápidos y seguros", "https://www.amazon.com.mx/s?k=conectores+wago");
    push("Cinta aislante PVC 18 mm", "Aislamiento básico", "https://www.homedepot.com.mx/b/electrico/cinta-aislante");
    push("Canaleta o tubo conduit", "Protección del cableado", "https://www.mercadolibre.com.mx/canaleta-electrica");
  }

  if (/caja de contacto|contacto|apagador/.test(lower)) {
    push("Chalupa/aro para caja", "Para instalación empotrada", "https://www.homedepot.com.mx/b/electrico/placas-y-cajas");
    push("Placa 1-2 módulos", "Acabado estético por marca", "https://www.amazon.com.mx/s?k=placa+bticino");
    push("Cinta aislante PVC", "Aislamiento y seguridad", "https://www.amazon.com.mx/s?k=cinta+aislante");
  }

  if (/minisplit|aire/.test(lower)) {
    push("Manguera de drenaje 1/2″", "Condensados", "https://www.mercadolibre.com.mx/manguera-drenaje-minisplit");
    push("Cinta foam para aislamiento", "Sellado y acabado", "https://www.amazon.com.mx/s?k=cinta+foam");
    push("Base para condensadora", "Montaje pared/piso", "https://www.homedepot.com.mx/b/aire-acondicionado");
  }

  res.json({ base_query, items: out });
});

// === 3) GENERAR EXCELS (solo cuando lo pida el usuario) ===
async function generarExcels(productos, filePrefix = "Cotizacion") {
  // Cliente (sin precios)
  const wbCliente = new ExcelJS.Workbook();
  const wsCliente = wbCliente.addWorksheet("Cotización Cliente");
  wsCliente.columns = [
    { header: "Producto / Descripción", key: "product", width: 60 },
    { header: "Cantidad", key: "qty", width: 10 },
    { header: "Unidad", key: "uom", width: 10 },
    { header: "Nota", key: "note", width: 40 }
  ];
  (productos || []).forEach((p) =>
    wsCliente.addRow({ product: p.product, qty: p.qty || 1, uom: p.uom || "pza", note: p.note || "" })
  );
  const fileCliente = `/tmp/${filePrefix}_Cliente.xlsx`;
  await wbCliente.xlsx.writeFile(fileCliente);

  // Interno (con precios y ligas)
  const wbInterno = new ExcelJS.Workbook();
  const wsInterno = wbInterno.addWorksheet("Cotización Interna");
  wsInterno.columns = [
    { header: "Producto / Descripción", key: "product", width: 60 },
    { header: "Marca", key: "brand", width: 20 },
    { header: "Precio (MXN)", key: "price", width: 18 },
    { header: "Tienda / Fuente", key: "store", width: 25 },
    { header: "Enlace", key: "url", width: 70 },
    { header: "Cantidad", key: "qty", width: 10 }
  ];
  (productos || []).forEach((p) =>
    wsInterno.addRow({
      product: p.product,
      brand: p.brand || "",
      price: p.price || "",
      store: p.store || "",
      url: p.url || "",
      qty: p.qty || 1
    })
  );
  const fileInterno = `/tmp/${filePrefix}_Interna.xlsx`;
  await wbInterno.xlsx.writeFile(fileInterno);

  return { fileCliente, fileInterno };
}

app.post("/generateExcels", async (req, res) => {
  const { productos, filePrefix } = req.body;
  try {
    const result = await generarExcels(productos, filePrefix || "Cotizacion");
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Healthcheck sencillo
app.get("/", (req, res) => res.send("Agente Eléctrico listo."));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Servidor activo en puerto", PORT));
