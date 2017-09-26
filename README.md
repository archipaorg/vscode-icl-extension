# ICL for Visual Studio Code

### IDE Features 
![IDE](https://i.imgur.com/ltGwBCl.gif)

## How to use this extension?
Install and open Visual Studio Code. Press Ctrl+Shift+X or Cmd+Shift+X to open the Extensions pane. Find and install the ICL extension. You can also install the extension from the Marketplace.Open any .icl file in VS Code. The extension is now activated.

### Customizing the ICL extension features
The ICL extension has some few settings that gives some control over the generated output. The settings are available at 

![VsCode Settings](https://i.imgur.com/5seuEPy.png)

Then filter on icl.*

![ICL Settings](https://i.imgur.com/jmfYAfQ.png)

And here is all the available settings :

`"icl.compilation.options.dontRemoveEmptyObject"`, default to false, this settings tells the compiler whether or not render an empty object.
`"icl.compilation.options.dontRemoveEmptyArray"`, default to false, this settings tells the compiler whether or not render an empty array.

`"icl.compilation.options.dontRemoveLibSection"`, default to false, this settings tells the compiler whether or not render library blocks.

`"icl.compilation.options.dontRemoveNullValues"`, default to false, this settings tells the compiler whether or not render null fields.

`"icl.compilation.output"`, default to "yaml", this settings tells the compiler whether we want to preview our ICL file in JSON or YAML.

### Commands
In addition to integrated editing features, the extension also provides one command (for the moment) in the Command Palette for working with icl files:

`ICL: Open Preview to the Side` to preview the generated output of the current ICL file.

You can access the above command from the command pallet (Cmd+Shift+P or Ctrl+Shift+P).

## License
[MPL-2](LICENSE)
