/*!
* The quick component is a form that will create a new component that the user can spawn from the app launcher.
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/

import React from "react";
import ReactDOM from "react-dom";
//Finsemble font-icons, general styling, and specific styling.
import { QuickComponentForm } from "@chartiq/finsemble-ui/react/components";
import "@chartiq/finsemble-ui/react/assets/css/finsemble.css"
import "../../../assets/css/_themeWhiteLabel.css";
ReactDOM.render(<QuickComponentForm /> , document.getElementById("bodyHere"));