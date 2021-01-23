package com.mycompany.app;

import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.*;
import org.springframework.web.bind.annotation.*;

@RestController
@EnableAutoConfiguration
public class App {
  @RequestMapping("/")
  public String index() {
    return "Hello World!";
  }

  public static void main(String[] args) {
    SpringApplication.run(App.class, args);
  }
}
