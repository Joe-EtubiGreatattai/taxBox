const QRCode = require("qrcode");

const data =
  "2@bMhZcrC2WBuK0jqNY8GVfMaE7vxAM8gjIwChYKdpDd5Hotxjp7H5j6L+xbaXAnF7fu5T3TD3mARIW7+KqjAqlADFIYgY4g6s9lY=,xvCTadD0lq6v2xdQi9poInPJIXGbNkh3gwDJD7cRZ2A=,sJ3xNs/OSNhfJlv/N2/CUZhizXHqyXxDnE3o+qq+rSs=,N2M7MZNqCvg6KlXIrSzZ6yw8LVPFVoe6sAhI++rN+v0=,1";

QRCode.toFile(
  "./qr.png",
  data,
  {
    errorCorrectionLevel: "H",
    type: "png",
    margin: 2,
    width: 300
  },
  (err) => {
    if (err) {
      console.error("QR generation failed:", err);
      return;
    }
    console.log("QR saved as qr.png");
  }
);
