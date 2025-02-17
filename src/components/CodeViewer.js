import React, { useState } from "react";

function CodeViewer({ code }) {
  const [copySuccess, setCopySuccess] = useState("");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopySuccess("Copied!");
      setTimeout(() => setCopySuccess(""), 2000);
    } catch (error) {
      setCopySuccess("Failed to copy!");
    }
  };

  return (
    <div style={{ position: "relative", margin: "1em 0" }}>
      <pre
        style={{
          backgroundColor: "#f4f4f4",
          padding: "10px",
          overflowX: "auto",
          borderRadius: "5px",
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
        }}
      >
        {code}
      </pre>
      <button
        onClick={handleCopy}
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          padding: "5px 10px",
          fontSize: "0.8em",
          cursor: "pointer",
        }}
      >
        Copy
      </button>
      {copySuccess && (
        <div
          style={{
            position: "absolute",
            top: "10px",
            right: "80px",
            backgroundColor: "#dff0d8",
            padding: "5px 10px",
            borderRadius: "3px",
            fontSize: "0.8em",
          }}
        >
          {copySuccess}
        </div>
      )}
    </div>
  );
}

export default CodeViewer;
