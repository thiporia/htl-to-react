import React, { useState } from "react";
import { convertHTLToReact } from "./components/HTLConverter";
import CodeViewer from "./components/CodeViewer";

function App() {
  const [htlInput, setHtlInput] = useState("");
  const [outputJSX, setOutputJSX] = useState("");

  const handleConvert = () => {
    const jsx = convertHTLToReact(htlInput);
    setOutputJSX(jsx);
  };

  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "40px auto",
        fontFamily: "sans-serif",
      }}
    >
      <h1>HTL → React Compiler</h1>

      <textarea
        rows={10}
        value={htlInput}
        onChange={(e) => setHtlInput(e.target.value)}
        placeholder="여기에 HTL 코드를 입력하세요..."
        style={{ width: "100%", marginBottom: "10px" }}
      />

      <button onClick={handleConvert}>Convert to React</button>

      <h2>변환 결과 (JSX)</h2>
      <CodeViewer code={outputJSX} />
    </div>
  );
}

export default App;
